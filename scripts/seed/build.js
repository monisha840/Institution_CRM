// Build one institution's complete dataset.
//
// Shared by both tenants: a school and a college both enrol students, employ
// staff, raise fees, run buses and lend books, and none of that deserves two
// implementations. Everything that genuinely differs — terms vs semesters,
// marks vs credits, parents vs guardians, what is taught and what is billed
// — comes in through the profile (see profiles.js).
//
// Returns { tables: { <table>: [rows] }, accounts: [...], summary: {...} }
// with rows already in database (snake_case) shape. Nothing here talks to
// the network; the orchestrator does the writing.
//
// Two rules the generated data follows, because breaking either is what
// makes seeded data feel fake:
//
//   * Numbers reconcile. A student's attendance percentage is computed from
//     the daily_logs actually generated for them, not picked at random. Fee
//     totals on the dashboard equal the sum of the fee rows. Exam marks
//     roll up to the GPA the transcript prints.
//
//   * History is plausible. Attendance skips Sundays and holidays, exams
//     fall in term order, receipts are dated after the fee was raised, and
//     a student who joined in June has no attendance in April.

import {
  rng, personName, guardianFor, mobile, iso, isoTs, daysAgo, addDays,
  workingDaysBack, humanDate, relativeLabel, roundFee, pad,
} from "./lib.js";
import { coreAccounts, staffEmail, guardianEmail } from "../../backend/lib/accounts.js";
import { tenantConfig } from "../../backend/lib/tenants.js";
import { gradeFor, computeGpa } from "../../backend/lib/institution.js";

export function buildTenant(profileArg, options = {}) {
  const P = profileArg;
  const T = tenantConfig(P.tenant);
  const NOW = options.now ? new Date(options.now) : new Date("2026-09-10T09:30:00Z");
  const r = rng(`sirah-crm-${P.tenant}-v1`);
  const X = P.idPrefix;

  const tables = {};
  const push = (table, rows) => {
    if (!rows || !rows.length) return;
    tables[table] = (tables[table] || []).concat(rows);
  };

  // Days the institution was shut, subtracted from every attendance
  // calculation so the percentages a screen shows match the register.
  const holidays = buildHolidays(P, NOW);
  const holidaySet = new Set(holidays.map((h) => h.date));
  // Ends today, not yesterday. A dashboard whose headline reads "register
  // not marked yet" makes the whole system look unused, and "today" is the
  // first thing anyone opening a school CRM looks at. Today is deliberately
  // only part-marked, which is what mid-morning actually looks like.
  const schoolDays = workingDaysBack(NOW, P.attendanceDays, holidaySet);
  const todayIso = iso(NOW);

  // =========================================================================
  // Classes and subjects
  // =========================================================================
  const subjectsForStage = (stage) => P.subjects.filter((s) => s.stages.includes(stage));

  push("subjects", P.subjects.map((s) => ({
    id: s.id, name: s.name, code: s.code, category: s.category,
    credits: s.credits ?? (P.usesCredits ? 3 : 4),
    created_at: isoTs(daysAgo(NOW, 300)),
  })));

  push("classes", P.classes.map((c) => ({
    n: c.n,
    label: P.tenant === "college" ? `Semester ${c.n}` : `Class ${c.n}`,
    sections: P.sections,
    subjects: subjectsForStage(c.stage).map((s) => s.name),
    created_at: isoTs(daysAgo(NOW, 300)),
  })));

  // Every (class, section) pair that actually runs.
  const cohorts = [];
  for (const c of P.classes) {
    for (const sec of P.sections) {
      cohorts.push({ n: c.n, section: sec, stage: c.stage, cls: `${c.n}-${sec}` });
    }
  }

  // =========================================================================
  // Staff
  // =========================================================================
  const staff = [];
  const staffUsers = [];
  let staffSeq = 100;

  // Core administration first — these are the people with logins defined in
  // backend/lib/accounts.js, and they need matching staff rows so the HR
  // screens, payroll and teacher-attendance all see them.
  const core = coreAccounts(P.tenant);
  for (const a of core) {
    const id = `${X}-STF-${pad(++staffSeq)}`;
    staff.push({
      id, name: a.name, role: a.title, dept: "Administration",
      phone: a.phone, email: a.email,
      joining_date: iso(daysAgo(NOW, r.int(700, 2600))),
      salary: r.int(45000, 95000),
      attendance: r.around(95, 3, 84, 100),
      tasks: r.int(0, 4), score: r.around(88, 6, 62, 99), status: "ok",
      created_at: isoTs(daysAgo(NOW, 300)),
    });
    staffUsers.push({
      id: a.id, email: a.email, role: a.role, name: a.name,
      linked_id: id, _password: a.password, _title: a.title,
    });
  }

  // Teaching staff, spread across the academic departments.
  const teachingDepts = P.departments.filter((d) => d !== "Administration" && d !== "Support");
  const teachers = [];
  for (const dept of teachingDepts) {
    for (let i = 0; i < P.teachersPerDept; i++) {
      const gender = r.chance(0.58) ? "f" : "m";
      const name = personName(r, gender);
      const id = `${X}-STF-${pad(++staffSeq)}`;
      const senior = i === 0;
      const role = senior ? r.pick(P.seniorTitles) : P.teachingTitle;
      const email = staffEmail(P.tenant, `${name} ${staffSeq}`).replace(`.${staffSeq}@`, "@");
      const row = {
        id, name, role, dept,
        phone: mobile(r),
        email: staffEmail(P.tenant, name).replace("@", `.${staffSeq}@`),
        joining_date: iso(daysAgo(NOW, r.int(120, 3200))),
        salary: r.int(P.teacherSalary[0], P.teacherSalary[1]),
        attendance: r.around(94, 4, 78, 100),
        tasks: r.int(0, 6),
        score: r.around(84, 8, 55, 99),
        status: "ok",
        created_at: isoTs(daysAgo(NOW, 300)),
      };
      staff.push(row);
      teachers.push(row);
    }
  }

  // Support staff — no login, but they draw a salary and appear in HR.
  for (const sr of P.supportRoles) {
    const count = sr.role === "Bus Driver" ? P.routes.length : r.int(1, 2);
    for (let i = 0; i < count; i++) {
      const name = personName(r, r.chance(0.35) ? "f" : "m");
      const id = `${X}-STF-${pad(++staffSeq)}`;
      staff.push({
        id, name, role: sr.role, dept: sr.dept,
        phone: mobile(r),
        email: staffEmail(P.tenant, name).replace("@", `.${staffSeq}@`),
        joining_date: iso(daysAgo(NOW, r.int(90, 2800))),
        salary: r.int(sr.salary[0], sr.salary[1]),
        attendance: r.around(93, 5, 74, 100),
        tasks: 0, score: r.around(80, 8, 55, 97), status: "ok",
        created_at: isoTs(daysAgo(NOW, 300)),
      });
    }
  }
  push("staff", staff);

  // Give every teacher a login. Their work address is their username, which
  // is how staff actually sign in to a system like this.
  let teacherUserSeq = 100;
  for (const t of teachers) {
    staffUsers.push({
      id: `${X}-USR-T${pad(++teacherUserSeq)}`,
      email: t.email, role: "teacher", name: t.name,
      linked_id: t.id,
      _password: `${P.tenant === "college" ? "Faculty" : "Teacher"}@${r.int(1000, 9999)}`,
      _title: t.role,
    });
  }

  // Several columns are foreign keys into `users`, not free text: the app
  // writes session.sub there. Teaching staff have both a staff row and a
  // user row, so anything FK-bound needs the *user* id even though the
  // surrounding display fields use the person's name.
  const userIdByStaffId = new Map(
    staffUsers.filter((u) => u.linked_id).map((u) => [u.linked_id, u.id])
  );
  const userIdFor = (staffRow) => userIdByStaffId.get(staffRow?.id) || core[0].id;

  const drivers = staff.filter((s) => s.role === "Bus Driver");

  // =========================================================================
  // Transport routes
  // =========================================================================
  const routes = P.routes.map((rt, i) => {
    const stopNames = P.stopsByRoute[rt.code] || [];
    // A morning run that is part-way through: earlier stops done, one
    // current, the rest still ahead. That is what the live board shows.
    const running = i < 2;
    const currentIdx = running ? r.int(1, Math.max(1, stopNames.length - 2)) : -1;
    let mins = 6 * 60 + 40;
    const stops = stopNames.map((name, si) => {
      mins += si === 0 ? 0 : r.int(8, 16);
      const t = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      let status;
      if (!running) status = undefined;
      else if (si < currentIdx) status = "done";
      else if (si === currentIdx) status = "current";
      return status ? { name, t, status } : { name, t };
    });
    stops.push({ name: T.shortName, t: `${String(Math.floor((mins + 14) / 60)).padStart(2, "0")}:${String((mins + 14) % 60).padStart(2, "0")}` });
    return {
      code: rt.code, name: rt.name,
      driver: drivers[i % Math.max(1, drivers.length)]?.name || "—",
      bus: rt.bus,
      status: running ? "running" : "idle",
      eta: stops[stops.length - 1].t,
      stops,
      direction: "both",
      started_at: running ? isoTs(new Date(NOW.getTime() - r.int(20, 60) * 60000)) : null,
      created_at: isoTs(daysAgo(NOW, 280)),
    };
  });
  push("routes", routes);

  // =========================================================================
  // Students and their guardians
  // =========================================================================
  const students = [];
  const guardianUsers = [];
  let studentSeq = 1000;

  for (const cohort of cohorts) {
    const n = r.int(P.studentsPerSection[0], P.studentsPerSection[1]);
    for (let i = 0; i < n; i++) {
      const gender = r.chance(0.5) ? "f" : "m";
      const name = personName(r, gender);
      const id = `${X}-STN-${++studentSeq}`;
      const guardian = guardianFor(r, name);
      // Most students join at the start of the year; a few are lateral
      // admissions partway through, and they get proportionally less history.
      const joinedDaysAgo = r.chance(0.86) ? r.int(200, 260) : r.int(20, 120);
      const onTransport = r.chance(
        P.feeHeads.find((h) => h.transportOnly)?.share ?? 0.4
      );
      const route = onTransport ? r.pick(routes) : null;
      const stop = route ? r.pick(route.stops.slice(0, -1)).name : null;

      const guardianPhoneNumber = mobile(r);
      students.push({
        id, name, cls: cohort.cls,
        parent: guardian.name,
        parent_phone: guardianPhoneNumber.replace(/\D/g, "").slice(-10),
        parent_email: guardianEmail(P.tenant, name, id),
        parent_relation: guardian.relation,
        fee: "pending",              // recomputed once fees are generated
        attendance: 0,               // recomputed from daily_logs below
        transport: route ? route.code : "—",
        pickup_stop: stop,
        joined: iso(daysAgo(NOW, joinedDaysAgo)),
        status: "active",
        created_at: isoTs(daysAgo(NOW, joinedDaysAgo)),
        _gender: gender,
        _guardianRelation: guardian.relation,
        _guardianPhone: guardianPhoneNumber,
        _joinedDaysAgo: joinedDaysAgo,
        _stage: cohort.stage,
        _n: cohort.n,
        _section: cohort.section,
      });
    }
  }

  // A handful of guardians get a real login — enough to exercise the
  // parent/guardian portal without minting two hundred dormant accounts.
  //
  // Namesakes are normal on a roster of this size, and two students called
  // Harini Subramanian would otherwise derive the same address. On a
  // collision we fall back to the student's numeric tail, which is what
  // provisionParentLogin() in lib/db.js does at runtime.
  const takenEmails = new Set(staffUsers.map((u) => u.email));
  let guardianSeq = 0;
  for (const s of r.sample(students, 12)) {
    guardianSeq++;
    let email = guardianEmail(P.tenant, s.name, s.id);
    if (takenEmails.has(email)) {
      const tail = String(s.id).match(/\d+$/)?.[0] || String(guardianSeq);
      email = email.replace("@", `.${tail}@`);
    }
    takenEmails.add(email);
    guardianUsers.push({
      id: `${X}-USR-G${pad(guardianSeq)}`,
      email,
      role: "parent",
      name: s.parent,
      linked_id: s.id,
      _password: `${P.tenant === "college" ? "Guardian" : "Parent"}@${r.int(1000, 9999)}`,
      _title: `${s._guardianRelation} of ${s.name}`,
      _child: s.name,
    });
  }

  // Archived students — a school always has some who left. They keep the
  // Students screen's archive tab honest.
  const archived = [];
  for (let i = 0; i < 6; i++) {
    const name = personName(r, r.chance(0.5) ? "f" : "m");
    const cohort = r.pick(cohorts);
    const leftDaysAgo = r.int(20, 200);
    archived.push({
      id: `${X}-STN-${++studentSeq}`,
      name, cls: cohort.cls,
      parent: guardianFor(r, name).name,
      fee: "paid", attendance: r.around(88, 6, 60, 100),
      transport: "—", joined: iso(daysAgo(NOW, r.int(400, 900))),
      status: "archived",
      archived_at: isoTs(daysAgo(NOW, leftDaysAgo)),
      created_at: isoTs(daysAgo(NOW, r.int(400, 900))),
    });
  }

  // =========================================================================
  // Attendance register — generated first, because the percentage printed on
  // a student's profile has to be derived from it rather than invented.
  // =========================================================================
  const dailyLogs = [];
  const attendanceStats = new Map(); // studentId -> { present, total }

  // Each student has a disposition that persists across the term. Real
  // absence is clustered — one child is reliably present, another misses a
  // week with dengue — and drawing each day independently loses that.
  const disposition = new Map();
  for (const s of students) {
    disposition.set(s.id, {
      base: r.chance(0.08) ? r.int(70, 82) : r.chance(0.25) ? r.int(83, 91) : r.int(92, 99),
      streak: 0,
    });
  }

  const subjectsByStage = new Map(P.classes.map((c) => [c.stage, subjectsForStage(c.stage)]));

  // Which cohorts have sent their register in so far today. Not all of
  // them — a partially complete morning is the honest picture, and it is
  // what makes the "N classes still to mark" prompt meaningful.
  const markedToday = new Set(r.sample(cohorts.map((c) => c.cls), Math.round(cohorts.length * 0.7)));

  for (const day of schoolDays) {
    const dayIso = iso(day);
    const dow = day.getUTCDay();
    const isToday = dayIso === todayIso;
    for (const s of students) {
      if (isToday && !markedToday.has(s.cls)) continue;
      // Nothing before the student was admitted.
      const joined = new Date(s.joined);
      if (day < joined) continue;

      const d = disposition.get(s.id);
      let status;
      if (d.streak > 0) {
        d.streak--;
        status = "absent";
      } else if (r.next() * 100 > d.base) {
        // Roughly a fifth of absences are the start of a multi-day illness.
        if (r.chance(0.22)) d.streak = r.int(1, 3);
        status = r.chance(0.18) ? "leave" : "absent";
      } else {
        status = r.chance(0.05) ? "late" : "present";
      }

      const stat = attendanceStats.get(s.id) || { present: 0, total: 0 };
      stat.total++;
      if (status === "present" || status === "late") stat.present++;
      attendanceStats.set(s.id, stat);

      const subs = subjectsByStage.get(s._stage) || [];
      const todaySubject = subs.length ? subs[(dow + s._n) % subs.length] : null;

      dailyLogs.push({
        student_id: s.id,
        date: dayIso,
        student_name: s.name,
        cls: s.cls,
        attendance: status,
        leave_reason: status === "leave" ? r.pick([
          "Fever", "Family function", "Medical appointment", "Out of town",
          "Viral infection", "Sibling's wedding",
        ]) : null,
        classwork: todaySubject ? `${todaySubject.name} — ${r.pick(CLASSWORK)}` : null,
        classwork_status: r.chance(0.9) ? "completed" : "pending",
        homework: todaySubject && r.chance(0.62)
          ? `${todaySubject.name}: ${r.pick(HOMEWORK)}`
          : null,
        homework_status: r.chance(0.82) ? "completed" : "pending",
        behaviour: r.chance(0.12) ? r.pick(BEHAVIOUR) : null,
        posted_by: r.pick(teachers).name,
        posted_at: isoTs(new Date(day.getTime() + (15 * 60 + r.int(0, 90)) * 60000)),
      });
    }
  }

  // Write the derived percentage back onto each student.
  for (const s of students) {
    const stat = attendanceStats.get(s.id);
    s.attendance = stat && stat.total
      ? Math.round((stat.present / stat.total) * 100)
      : 0;
  }

  push("daily_logs", dailyLogs);

  // =========================================================================
  // Fees — raised per head, then partly collected.
  // =========================================================================
  const pendingFees = [];
  const recentFees = [];
  let receiptSeq = 5000;

  for (const s of students) {
    for (const head of P.feeHeads) {
      if (head.transportOnly && s.transport === "—") continue;
      if (!head.transportOnly && head.share < 1 && !r.chance(head.share)) continue;

      const amount = roundFee(head.base + head.perClass * s._n);
      // Earlier heads are more likely to have been settled: a family that is
      // up to date has paid Term I and II and owes Term III.
      const headIndex = P.feeHeads.indexOf(head);
      const paidChance = Math.max(0.15, 0.9 - headIndex * 0.16);
      const paid = r.chance(paidChance);

      if (paid) {
        const paidAt = daysAgo(NOW, r.int(3, 170));
        recentFees.push({
          id: `${X}-RCT-${++receiptSeq}`,
          student_id: s.id, name: s.name, cls: s.cls,
          amount, fee_type: head.key,
          method: r.pick(["UPI", "UPI", "UPI", "Cash", "Bank transfer", "Cheque"]),
          time: relativeLabel(paidAt, NOW),
          status: "paid",
          paid_at: isoTs(paidAt),
        });
      } else {
        const dueOffset = r.int(-40, 45);
        const dueDate = addDays(NOW, dueOffset);
        pendingFees.push({
          id: `${s.id}__${head.key}`,
          student_id: s.id, name: s.name, cls: s.cls,
          amount, fee_type: head.key,
          due: dueOffset < 0
            ? `overdue by ${Math.abs(dueOffset)} days`
            : dueOffset === 0 ? "due today" : `in ${dueOffset} days`,
          overdue: dueOffset < 0,
          created_at: isoTs(daysAgo(NOW, r.int(60, 200))),
        });
      }
    }
    s.fee = pendingFees.some((f) => f.student_id === s.id) ? "pending" : "paid";
  }
  push("pending_fees", pendingFees);
  push("recent_fees", recentFees);

  // Students are pushed only now, with attendance and fee status resolved.
  push("students", students.map(stripPrivate).concat(archived));

  // =========================================================================
  // Timetable
  // =========================================================================
  const timetable = [];
  const teachersByDept = new Map();
  for (const t of teachers) {
    if (!teachersByDept.has(t.dept)) teachersByDept.set(t.dept, []);
    teachersByDept.get(t.dept).push(t);
  }
  const teacherForSubject = (subject, cls) => {
    // Prefer a teacher from the department that owns the subject; fall back
    // to anyone, so no slot is left without a name against it.
    const pool = [...teachersByDept.values()].find((list) =>
      list[0] && subjectDeptMatches(list[0].dept, subject)
    ) || teachers;
    const key = `${subject.code}-${cls}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
  };

  for (const cohort of cohorts) {
    const subs = subjectsForStage(cohort.stage);
    if (!subs.length) continue;
    for (const day of P.workingDays) {
      const periods = day === P.shortDay ? P.shortDayPeriods : P.periodsPerDay;
      for (let p = 1; p <= periods; p++) {
        const subject = subs[(p + cohort.n + P.workingDays.indexOf(day)) % subs.length];
        const teacher = teacherForSubject(subject, cohort.cls);
        timetable.push({
          id: `${X}-TT-${cohort.cls}-${day}-${p}`,
          cls: cohort.cls, day, period: p,
          subject: subject.name,
          teacher_id: teacher?.id || null,
          teacher_name: teacher?.name || "—",
          room: P.tenant === "college"
            ? `${cohort.section}-${200 + cohort.n}`
            : `R-${cohort.n}${cohort.section === "A" ? "01" : "02"}`,
          updated_at: isoTs(daysAgo(NOW, r.int(10, 90))),
        });
      }
    }
  }
  push("timetable", timetable);

  // =========================================================================
  // Exams and marks
  // =========================================================================
  const exams = [];
  const examMarks = [];
  let examSeq = 0;
  let markSeq = 0;
  const gpaRows = new Map(); // studentId -> [{score, maxMarks, credits}]

  for (const cohort of cohorts) {
    const subs = subjectsForStage(cohort.stage).filter(P.examinable);
    const cohortStudents = students.filter((s) => s.cls === cohort.cls);
    if (!cohortStudents.length) continue;

    for (const cycle of P.examCycles) {
      for (const subject of subs) {
        const date = daysAgo(NOW, cycle.monthsAgo * 30 + r.int(-4, 4));
        const examId = `${X}-EXM-${pad(++examSeq, 4)}`;
        exams.push({
          id: examId,
          name: cycle.name,
          type: cycle.type,
          cls: cohort.cls,
          subject: subject.name,
          max_marks: cycle.max,
          date: iso(date),
          created_by: teacherForSubject(subject, cohort.cls)?.name || "—",
          created_at: isoTs(date),
        });

        for (const s of cohortStudents) {
          // A student's marks track their attendance — the child who is
          // never in class does not top the paper. Correlated, not copied.
          const ability = 40 + (s.attendance - 70) * 1.1 + r.int(-14, 18);
          const pct = Math.max(18, Math.min(99, ability));
          const score = Math.round((pct / 100) * cycle.max);
          examMarks.push({
            id: `${X}-MRK-${pad(++markSeq, 5)}`,
            exam_id: examId,
            student_id: s.id,
            student_name: s.name,
            score,
            max_marks: cycle.max,
            remarks: pct < 40 ? "Needs improvement" : pct > 88 ? "Excellent" : null,
            recorded_by: exams[exams.length - 1].created_by,
            recorded_at: isoTs(addDays(date, r.int(2, 9))),
          });

          if (!gpaRows.has(s.id)) gpaRows.set(s.id, []);
          if (cycle.type === "final") {
            gpaRows.get(s.id).push({
              score, maxMarks: cycle.max,
              credits: subject.credits ?? 3,
            });
          }
        }
      }
    }
  }
  push("exams", exams);
  push("exam_marks", examMarks);

  // =========================================================================
  // Syllabus
  // =========================================================================
  const syllabus = [];
  let sylSeq = 0;
  for (const c of P.classes) {
    for (const subject of subjectsForStage(c.stage).filter(P.examinable)) {
      const chapters = r.int(4, 7);
      for (let ch = 1; ch <= chapters; ch++) {
        syllabus.push({
          id: `${X}-SYL-${pad(++sylSeq, 4)}`,
          cls: `${c.n}-${P.sections[0]}`,
          subject: subject.name,
          chapter: `Unit ${ch}`,
          topic: `${subject.name} — ${r.pick(TOPIC_WORDS)} ${ch}`,
          // int 1..4. For the college the two halves of the year are 1 and
          // 2 (odd and even semester); for the school, the three terms.
          term: P.tenant === "college"
            ? (c.n % 2 === 1 ? 1 : 2)
            : Math.min(3, Math.ceil(ch / 2)),
          week_no: ch * 3,
          notes: r.chance(0.3) ? "Includes a practical component." : null,
          added_at: isoTs(daysAgo(NOW, r.int(60, 240))),
          added_by: teacherForSubject(subject, `${c.n}-A`)?.name || "—",
        });
      }
    }
  }
  push("syllabus", syllabus);

  // =========================================================================
  // Teacher attendance — last 30 working days
  // =========================================================================
  const teacherAttendance = [];
  let taSeq = 0;
  for (const day of schoolDays.slice(-30)) {
    for (const t of staff) {
      const present = r.chance(0.955);
      const onLeave = !present && r.chance(0.55);
      teacherAttendance.push({
        id: `${X}-TA-${pad(++taSeq, 5)}`,
        teacher_id: t.id, teacher_name: t.name,
        date: iso(day),
        status: present ? "present" : onLeave ? "leave" : "absent",
        leave_reason: onLeave ? r.pick(["Casual leave", "Medical leave", "On duty", "Earned leave"]) : null,
        marked_by: "Office",
        marked_at: isoTs(new Date(day.getTime() + 9.5 * 3600000)),
      });
    }
  }
  push("teacher_attendance", teacherAttendance);

  // =========================================================================
  // Transport attendance — last 10 days, morning and evening
  // =========================================================================
  const transportAttendance = [];
  const busStudents = students.filter((s) => s.transport !== "—");
  for (const day of schoolDays.slice(-10)) {
    for (const s of busStudents) {
      for (const direction of ["morning", "evening"]) {
        const boarded = r.chance(0.93);
        transportAttendance.push({
          student_id: s.id,
          date: iso(day),
          direction,
          route_code: s.transport,
          stop_name: s.pickup_stop,
          status: boarded ? "boarded" : "absent",
          student_name: s.name,
          cls: s.cls,
          marked_by: routes.find((rt) => rt.code === s.transport)?.driver || "Driver",
          marked_at: isoTs(new Date(day.getTime() + (direction === "morning" ? 7.5 : 16.5) * 3600000)),
        });
      }
    }
  }
  push("transport_attendance", transportAttendance);

  // =========================================================================
  // Library
  // =========================================================================
  const library = [];
  let bookSeq = 6000;
  const bookTitles = P.tenant === "college" ? COLLEGE_BOOKS : SCHOOL_BOOKS;
  for (const b of bookTitles) {
    library.push({
      id: `${X}-BK-${++bookSeq}`,
      title: b.title, author: b.author,
      category: b.category,
      isbn: `978-${r.int(81, 93)}-${r.int(1000, 9999)}-${r.int(100, 999)}-${r.int(0, 9)}`,
      shelf: `${r.pick(["A", "B", "C", "D"])}-${r.int(1, 12)}`,
      total_copies: r.int(2, 8),
      added_at: isoTs(daysAgo(NOW, r.int(30, 700))),
    });
  }
  push("library", library);

  const loans = [];
  let loanSeq = 0;
  for (const book of r.sample(library, Math.floor(library.length * 0.55))) {
    const copies = r.int(1, Math.min(3, book.total_copies));
    for (let i = 0; i < copies; i++) {
      const isStudent = r.chance(0.78);
      const borrower = isStudent ? r.pick(students) : r.pick(staff);
      const borrowedAt = daysAgo(NOW, r.int(1, 60));
      const dueAt = addDays(borrowedAt, 14);
      const returned = r.chance(0.6);
      loans.push({
        id: `${X}-LN-${pad(++loanSeq, 4)}`,
        book_id: book.id, book_title: book.title,
        borrower_type: isStudent ? "student" : "staff",
        borrower_id: borrower.id, borrower_name: borrower.name,
        borrowed_at: isoTs(borrowedAt),
        due_at: isoTs(dueAt),
        returned_at: returned ? isoTs(addDays(borrowedAt, r.int(3, 18))) : null,
        issued_by: "Librarian",
        returned_by: returned ? "Librarian" : null,
      });
    }
  }
  push("library_loans", loans);

  // =========================================================================
  // Inventory
  // =========================================================================
  push("inventory_categories", P.inventoryCategories.map((k) => ({
    key: k.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    created_at: isoTs(daysAgo(NOW, 250)),
  })));

  const inventory = [];
  const movements = [];
  let invSeq = 0;
  let mvSeq = 0;
  const invItems = P.tenant === "college" ? COLLEGE_INVENTORY : SCHOOL_INVENTORY;
  for (const item of invItems) {
    const id = `${X}-INV-${pad(++invSeq, 3)}`;
    const purchased = r.int(20, 400);
    const issued = r.int(0, Math.floor(purchased * 0.7));
    inventory.push({
      id, name: item.name,
      category: item.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: item.description || null,
      storage_location: r.pick(["Main Store", "Block A Store", "Lab Store", "Office"]),
      on_hand: purchased - issued,
      min: Math.max(5, Math.floor(purchased * 0.12)),
      issued,
      qty_purchased: purchased,
      unit_price: item.price,
      supplier: r.pick(SUPPLIERS),
      created_at: isoTs(daysAgo(NOW, r.int(40, 400))),
    });
    for (let i = 0; i < r.int(1, 3); i++) {
      movements.push({
        id: `${X}-MV-${pad(++mvSeq, 4)}`,
        item_id: id,
        type: r.chance(0.6) ? "issue" : "purchase",
        qty: r.int(1, 30),
        note: r.pick(["Term opening", "Replacement", "Lab requirement", "Office use", "Damaged stock"]),
        issued_to: r.pick(staff).name,
        who: "Store Keeper",
        at: isoTs(daysAgo(NOW, r.int(1, 180))),
      });
    }
  }
  push("inventory", inventory);
  push("inventory_movements", movements);

  // =========================================================================
  // Finance — expense categories and expenses
  // =========================================================================
  const expCats = P.expenseCategories.map((name, i) => ({
    id: `${X}-ECAT-${pad(i + 1)}`,
    category_name: name,
    category_type: "school",
    created_by: core[0].id,
    created_at: isoTs(daysAgo(NOW, 260)),
  }));
  push("expense_categories", expCats);

  const expenses = [];
  let expSeq = 0;
  for (let m = 0; m < 6; m++) {
    for (const cat of expCats) {
      if (cat.category_name !== "Salaries" && !r.chance(0.55)) continue;
      const isSalary = cat.category_name === "Salaries";
      // A running institution covers its costs. Payroll is the dominant
      // line, so it is the one that decides whether the P&L reads as a
      // going concern or as a school about to close — and a demo showing a
      // ₹12L deficit is not the story. Salaries land near two thirds of
      // collected fees, which is roughly where a fee-funded school sits.
      const monthlyPayroll = Math.round(staff.reduce((a, st) => a + st.salary, 0));
      const amount = isSalary
        ? monthlyPayroll
        : r.int(4000, 60000);
      const date = daysAgo(NOW, m * 30 + r.int(1, 25));
      expenses.push({
        id: `${X}-EXP-${pad(++expSeq, 4)}`,
        scope: "school",
        category: cat.category_name,
        category_id: cat.id,
        amount,
        vendor: isSalary ? "Payroll" : r.pick(SUPPLIERS),
        memo: isSalary
          ? `Staff salary — ${date.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`
          : r.pick(EXPENSE_MEMOS),
        date: iso(date),
        payment_method: isSalary ? "Bank transfer" : r.pick(["Bank transfer", "UPI", "Cash", "Cheque"]),
        recorded_by: core.find((a) => a.role === "school_accountant")?.name || core[0].name,
        created_at: isoTs(date),
      });
    }
  }
  push("expenses", expenses);

  // =========================================================================
  // Admissions pipeline and complaints
  // =========================================================================
  const enquiries = [];
  for (let i = 0; i < 24; i++) {
    const gender = r.chance(0.5) ? "f" : "m";
    const name = personName(r, gender);
    const date = daysAgo(NOW, r.int(1, 120));
    const age = P.tenant === "college" ? r.int(17, 19) : r.int(4, 16);
    enquiries.push({
      id: `${X}-ENQ-${pad(i + 1, 3)}`,
      name,
      parent: guardianFor(r, name).name,
      phone: mobile(r),
      // int: the class or semester being applied for. An enquiry predates
      // admission, so there is no section to record yet.
      cls: r.pick(P.classes).n,
      source: r.pick(["Walk-in", "Website", "Referral", "Phone", "Education fair", "Social media"]),
      date: iso(date),
      status: r.pick(["new", "new", "contacted", "contacted", "visited", "admitted", "closed"]),
      dob: iso(daysAgo(NOW, age * 365 + r.int(0, 360))),
      age,
      city: T.city,
      created_at: isoTs(date),
    });
  }
  push("enquiries", enquiries);

  const complaints = [];
  for (let i = 0; i < 11; i++) {
    const s = r.pick(students);
    const date = daysAgo(NOW, r.int(1, 90));
    complaints.push({
      id: `${X}-CMP-${pad(i + 1, 3)}`,
      student: s.name, student_id: s.id, cls: s.cls,
      parent: s.parent,
      issue: r.pick(P.tenant === "college" ? COLLEGE_COMPLAINTS : SCHOOL_COMPLAINTS),
      type: r.pick(["academic", "transport", "facility", "discipline", "fees"]),
      category: r.pick(["academic", "transport", "facility", "discipline", "fees"]),
      date: iso(date),
      status: r.pick(["open", "open", "in_progress", "resolved", "resolved"]),
      assigned: r.pick(staff).name,
      submitted_by: s.parent,
      created_at: isoTs(date),
    });
  }
  push("complaints", complaints);

  // =========================================================================
  // Workflow — tasks, meetings, leave, recognition, activities
  // =========================================================================
  const tasks = [];
  const taskTitles = P.tenant === "college" ? COLLEGE_TASKS : SCHOOL_TASKS;
  taskTitles.forEach((t, i) => {
    const assignee = r.pick(teachers);
    const created = daysAgo(NOW, r.int(2, 45));
    const status = r.pick(["pending", "pending", "yes", "yes", "no"]);
    tasks.push({
      id: `${X}-TSK-${pad(i + 1, 3)}`,
      title: t.title, description: t.description,
      assigned_to: assignee.id, assigned_to_name: assignee.name,
      assigned_to_role: "teacher",
      assigned_by: core[1].id, assigned_by_name: core[1].name,
      status,
      priority: r.pick(["low", "medium", "medium", "high"]),
      due_date: iso(addDays(NOW, r.int(-8, 21))),
      response: status === "yes" ? "Completed" : status === "no" ? "Not yet" : null,
      remarks: status === "no" ? r.pick(["Waiting on the office", "Needs more time", "Blocked on approval"]) : null,
      created_at: isoTs(created),
      updated_at: isoTs(addDays(created, r.int(0, 6))),
    });
  });
  push("tasks", tasks);

  const meetings = [];
  const meetingTitles = P.tenant === "college" ? COLLEGE_MEETINGS : SCHOOL_MEETINGS;
  meetingTitles.forEach((m, i) => {
    const when = addDays(NOW, r.int(-20, 25));
    meetings.push({
      id: `${X}-MTG-${pad(i + 1, 3)}`,
      title: m.title, description: m.description,
      scheduled_at: isoTs(new Date(when.setUTCHours(r.int(9, 16), r.pick([0, 30]), 0, 0))),
      location: r.pick(["Conference Hall", "Principal's Office", "Seminar Hall", "Staff Room", "Online — Google Meet"]),
      audience: m.audience,
      audience_label: m.audienceLabel,
      created_by_email: core[1].email,
      created_by_name: core[1].name,
      created_at: isoTs(daysAgo(NOW, r.int(5, 40))),
    });
  });
  push("meetings", meetings);

  const leaveRequests = [];
  for (let i = 0; i < 14; i++) {
    const isStaff = r.chance(0.6);
    const who = isStaff ? r.pick(staff) : r.pick(students);
    const from = addDays(NOW, r.int(-30, 12));
    const status = r.pick(["pending", "pending", "approved", "approved", "rejected"]);
    leaveRequests.push({
      id: `${X}-LV-${pad(i + 1, 3)}`,
      requester_type: isStaff ? "staff" : "student",
      requester_id: who.id,
      leave_type: r.pick(["Casual", "Medical", "Earned", "On duty"]),
      reason: r.pick([
        "Family function at native place", "Fever and body pain",
        "Medical check-up", "Sister's wedding", "Attending a workshop",
        "Personal work", "Travel — out of station",
      ]),
      from_date: iso(from),
      to_date: iso(addDays(from, r.int(0, 4))),
      approval_status: status,
      approved_by: status === "pending" ? null : core[1].id,
      approved_at: status === "pending" ? null : isoTs(addDays(from, -1)),
      created_at: isoTs(addDays(from, -r.int(1, 8))),
    });
  }
  push("leave_requests", leaveRequests);

  const remarks = [];
  for (let i = 0; i < 18; i++) {
    const positive = r.chance(0.6);
    const s = r.pick(students);
    const created = daysAgo(NOW, r.int(1, 80));
    remarks.push({
      id: `${X}-RR-${pad(i + 1, 3)}`,
      target_type: "student", target_id: s.id,
      type: positive ? "reward" : "remark",
      category: positive
        ? r.pick(["academic", "sports", "conduct", "leadership"])
        : r.pick(["discipline", "attendance", "homework", "uniform"]),
      description: positive ? r.pick(REWARDS) : r.pick(REMARKS),
      action_taken: positive ? null : r.pick(["Counselled", "Guardian informed", "Warning issued"]),
      created_by: userIdFor(r.pick(teachers)),
      created_at: isoTs(created),
      resolved_at: !positive && r.chance(0.5) ? isoTs(addDays(created, r.int(1, 10))) : null,
    });
  }
  push("remarks_rewards", remarks);

  const activities = [];
  for (let i = 0; i < 22; i++) {
    const s = r.pick(students);
    const date = daysAgo(NOW, r.int(5, 200));
    activities.push({
      id: `${X}-ACT-${pad(i + 1, 3)}`,
      student_id: s.id,
      activity_name: r.pick(P.activityNames),
      event_name: r.pick(["State Level", "District Level", "Inter-School", "Inter-College", "Zonal", "National Level"]),
      achievement_level: r.pick(["Participation", "Third Place", "Second Place", "First Place", "Winner"]),
      external_competition: r.chance(0.55),
      activity_date: iso(date),
      created_by: userIdFor(r.pick(teachers)),
      created_at: isoTs(date),
    });
  }
  push("student_activities", activities);

  push("staff_awards", r.sample(teachers, 7).map((t, i) => ({
    id: `${X}-AWD-${pad(i + 1, 3)}`,
    staff_id: t.id, staff_name: t.name,
    title: r.pick([
      "Teacher of the Month", "Perfect Attendance", "Best Result — Board Exams",
      "Outstanding Mentor", "Long Service Award", "Innovation in Teaching",
    ]),
    citation: r.pick([
      "Consistently strong results and excellent rapport with students.",
      "Not a single day absent across the academic year.",
      "Went well beyond the syllabus to support weaker students.",
      "Introduced project-based assessment across the department.",
    ]),
    category: r.pick(["recognition", "attendance", "academic", "service"]),
    awarded_at: humanDate(daysAgo(NOW, r.int(20, 300))).slice(3),
    awarded_by: core[1].name,
    created_at: isoTs(daysAgo(NOW, r.int(20, 300))),
  })));

  // =========================================================================
  // Records — certificates, compliance documents
  // =========================================================================
  const tcRequests = [];
  for (let i = 0; i < 6; i++) {
    const s = archived[i % archived.length];
    const requested = daysAgo(NOW, r.int(5, 150));
    const issued = r.chance(0.65);
    tcRequests.push({
      id: `${X}-TC-${pad(i + 1, 3)}`,
      student_id: s.id, student_name: s.name, cls: s.cls,
      reason: r.pick([
        "Relocating to another city", "Parent transferred",
        "Moving to a residential school", "Higher studies elsewhere",
        "Family shifting abroad",
      ]),
      status: issued ? "issued" : "pending",
      requested_by: s.parent,
      requested_at: isoTs(requested),
      issued_at: issued ? isoTs(addDays(requested, r.int(2, 14))) : null,
      issued_by: issued ? core[1].name : null,
      serial_no: issued ? `${X}/TC/${2026}/${pad(i + 1, 3)}` : null,
    });
  }
  push("tc_requests", tcRequests);

  const govDocs = (P.tenant === "college" ? COLLEGE_DOCS : SCHOOL_DOCS).map((d, i) => ({
    id: `${X}-GOV-${pad(i + 1, 3)}`,
    title: d.title,
    document_type: d.type,
    expiry_date: d.expiresInDays == null ? null : iso(addDays(NOW, d.expiresInDays)),
    uploaded_by: core[0].id,
    notes: d.notes || null,
    created_at: isoTs(daysAgo(NOW, r.int(60, 500))),
  }));
  push("government_documents", govDocs);

  // =========================================================================
  // Communication
  // =========================================================================
  push("message_templates", (P.tenant === "college" ? COLLEGE_TEMPLATES : SCHOOL_TEMPLATES).map((t, i) => ({
    id: `${X}-TPL-${pad(i + 1, 3)}`,
    name: t.name, channel: t.channel, body: t.body,
    created_at: isoTs(daysAgo(NOW, r.int(30, 300))),
  })));

  const broadcasts = [];
  (P.tenant === "college" ? COLLEGE_BROADCASTS : SCHOOL_BROADCASTS).forEach((b, i) => {
    const sentAt = daysAgo(NOW, r.int(1, 90));
    const sent = r.int(120, students.length + 80);
    broadcasts.push({
      id: `${X}-BC-${pad(i + 1, 3)}`,
      campaign: b.campaign, channel: b.channel,
      audience: b.audience, audience_label: b.audienceLabel,
      message: b.message,
      sent, delivered: Math.floor(sent * (0.9 + r.next() * 0.09)),
      sent_at: isoTs(sentAt),
    });
  });
  push("broadcasts", broadcasts);

  // Parent/guardian ↔ office message threads.
  const messages = [];
  const adminUser = staffUsers.find((u) => u.role === "admin");
  let msgSeq = 0;
  for (const gu of guardianUsers.slice(0, 7)) {
    const created = daysAgo(NOW, r.int(1, 30));
    messages.push({
      id: `${X}-MSG-${pad(++msgSeq, 3)}`,
      sender_id: gu.id, receiver_id: adminUser.id,
      sender_role: "parent", receiver_role: "admin",
      message: r.pick(PARENT_MESSAGES),
      is_read: r.chance(0.6),
      created_at: isoTs(created),
    });
    if (r.chance(0.7)) {
      messages.push({
        id: `${X}-MSG-${pad(++msgSeq, 3)}`,
        sender_id: adminUser.id, receiver_id: gu.id,
        sender_role: "admin", receiver_role: "parent",
        message: r.pick(OFFICE_REPLIES),
        is_read: true,
        created_at: isoTs(addDays(created, r.int(0, 2))),
      });
    }
  }
  push("messages", messages);

  // =========================================================================
  // Notifications, activity feed, audit trail
  // =========================================================================
  const notifications = [];
  let notifSeq = 0;
  const allUsers = [...staffUsers, ...guardianUsers];
  for (const u of allUsers) {
    for (let i = 0; i < r.int(0, 4); i++) {
      const created = daysAgo(NOW, r.int(0, 14));
      const n = r.pick(u.role === "parent" ? PARENT_NOTIFS : STAFF_NOTIFS);
      notifications.push({
        id: `${X}-NTF-${pad(++notifSeq, 4)}`,
        user_id: u.id,
        notification_type: n.type,
        title: n.title,
        description: n.description,
        redirect_url: n.url || null,
        is_read: r.chance(0.45),
        created_at: isoTs(created),
      });
    }
  }
  push("notifications", notifications);

  // activities.id is a bigserial, so these rows deliberately carry no id
  // of their own — the database assigns one on insert.
  const feed = [];
  for (const f of recentFees.slice(0, 8)) {
    feed.push({
      t: "fee", tone: "ok",
      title: `Fee received — ₹${f.amount.toLocaleString("en-IN")}`,
      sub: `${f.name} · ${f.cls} · ${f.method}`,
      ts: f.time,
      created_at: f.paid_at,
    });
  }
  for (const e of enquiries.slice(0, 6)) {
    feed.push({
      t: "enquiry", tone: "info",
      title: `New admission enquiry — ${e.name}`,
      sub: `${e.source} · ${e.parent}`,
      ts: relativeLabel(e.created_at, NOW),
      created_at: e.created_at,
    });
  }
  for (const c of complaints.slice(0, 5)) {
    feed.push({
      t: "complaint", tone: c.status === "resolved" ? "ok" : "warn",
      title: `Complaint ${c.status === "resolved" ? "resolved" : "raised"} — ${c.student}`,
      sub: c.issue,
      ts: relativeLabel(c.created_at, NOW),
      created_at: c.created_at,
    });
  }
  push("activities", feed);

  const audit = [];
  let auditSeq = 0;
  for (let i = 0; i < 70; i++) {
    const who = r.pick([...staffUsers.slice(0, 6)]);
    const act = r.pick(AUDIT_ACTIONS);
    const when = daysAgo(NOW, r.int(0, 45));
    audit.push({
      id: `${X}-AUD-${pad(++auditSeq, 4)}`,
      who: who.name,
      action: act.action,
      entity: act.entity,
      when_label: relativeLabel(when, NOW),
      ip: `10.${r.int(0, 4)}.${r.int(0, 255)}.${r.int(2, 254)}`,
      created_at: isoTs(when),
    });
  }
  push("audit_log", audit);

  // =========================================================================
  // Institution profile rows
  // =========================================================================
  const collected = recentFees.reduce((a, f) => a + f.amount, 0);
  push("schools", [{
    id: `${X}-SCH-01`,
    name: T.name, city: T.city, status: "Active",
    students: students.length,
    fees: collected,
    puck: "ink",
    created_at: isoTs(daysAgo(NOW, 300)),
  }]);

  push("app_settings", buildSettings(P, T, NOW, holidays));

  // =========================================================================
  // Users — hashed by the orchestrator
  // =========================================================================
  const users = [...staffUsers, ...guardianUsers].map((u) => ({
    id: u.id, email: u.email, role: u.role, name: u.name,
    linked_id: u.linked_id || null,
    created_at: isoTs(daysAgo(NOW, r.int(30, 300))),
    _password: u._password,
    _title: u._title,
    _child: u._child,
  }));
  push("users", users);

  // ---- GPA, reported back for the summary --------------------------------
  let gpaAvg = null;
  if (P.usesCredits) {
    const values = [...gpaRows.values()].map((rows) => computeGpa(rows)).filter((v) => v != null);
    if (values.length) {
      gpaAvg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    }
  }

  return {
    tables,
    accounts: users.filter((u) => u._password),
    summary: {
      tenant: P.tenant,
      institution: T.name,
      students: students.length,
      archived: archived.length,
      staff: staff.length,
      logins: users.length,
      classes: P.classes.length,
      cohorts: cohorts.length,
      subjects: P.subjects.length,
      attendanceRows: dailyLogs.length,
      attendanceDays: schoolDays.length,
      exams: exams.length,
      marks: examMarks.length,
      timetableSlots: timetable.length,
      feesRaised: pendingFees.reduce((a, f) => a + f.amount, 0) + collected,
      feesCollected: collected,
      feesPending: pendingFees.reduce((a, f) => a + f.amount, 0),
      gpaAvg,
      totalRows: Object.values(tables).reduce((a, rows) => a + rows.length, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drop the underscore-prefixed working fields before a row is inserted. */
function stripPrivate(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (!k.startsWith("_")) out[k] = v;
  }
  return out;
}

function subjectDeptMatches(dept, subject) {
  const d = dept.toLowerCase();
  const n = subject.name.toLowerCase();
  if (d.includes("math") && n.includes("math")) return true;
  if (d.includes("science") && /science|physics|chemistry|biology/.test(n)) return true;
  if (d.includes("language") && /english|tamil|hindi/.test(n)) return true;
  if (d.includes("computer") && /computer|python|data|algorithm|software|machine/.test(n)) return true;
  if (d.includes("physical") && /physical/.test(n)) return true;
  if (d.includes("electronic") && /signal|digital|electronic|iot/.test(n)) return true;
  if (d.includes("mechanical") && /machine|heat|cad/.test(n)) return true;
  return false;
}

/** Public holidays the institution actually observed in the window. */
function buildHolidays(P, NOW) {
  const named = [
    { offset: 12, reason: "Vinayaka Chaturthi" },
    { offset: 34, reason: "Onam" },
    { offset: 58, reason: "Independence Day" },
    { offset: 74, reason: "Local holiday — heavy rain" },
    { offset: 96, reason: "Ramzan" },
    { offset: 120, reason: "Tamil New Year" },
  ];
  return named.map((h) => ({
    date: iso(daysAgo(NOW, h.offset)),
    reason: h.reason,
  }));
}

function buildSettings(P, T, NOW, holidays) {
  const rows = [];
  const put = (section, key, value) => rows.push({
    section, key, value: String(value), updated_at: isoTs(NOW),
  });

  put("school", "institutionType", T.institutionType);
  put("school", "name", T.name);
  put("school", "legalName", T.legalName);
  put("school", "city", `${T.city}, ${T.state}`);
  put("school", "address", `${T.addressLine1}, ${T.addressLine2} ${T.pincode}`);
  put("school", "phone", T.phone);
  put("school", "email", T.email);
  put("school", "website", T.website);
  put("school", "programme", T.affiliation);
  put("school", "recognition", T.recognition);

  put("trust", "name", T.trustName);
  put("trust", "regNo", T.trustRegNo);
  put("trust", "pan80g", `${T.trustPan} · ${T.trust80g}`);
  put("trust", "contact", T.email);

  put("finance", "upi", T.upi);
  put("finance", "upiPayeeName", T.upiPayeeName);
  put("finance", "bankName", T.bankName);
  put("finance", "bankAccount", T.bankAccount);
  put("finance", "bankIfsc", T.bankIfsc);
  put("finance", "academicYear", T.academicYear);

  put("academic", "workingDays", P.attendanceDays + holidays.length);
  put("academic", "holidays", JSON.stringify(holidays));

  return rows;
}

// ---------------------------------------------------------------------------
// Content pools
// ---------------------------------------------------------------------------
const CLASSWORK = [
  "revision of last week's unit", "worked examples on the board",
  "group activity", "chapter reading and discussion", "problem set",
  "practical demonstration", "test paper discussion", "new unit introduction",
];
const HOMEWORK = [
  "exercise 4.2, questions 1-10", "read the next chapter",
  "complete the worksheet", "prepare notes for the unit test",
  "finish the record book", "solve the previous year paper",
  "submit the assignment", "practise the diagrams",
];
const BEHAVIOUR = [
  "Very helpful with classmates today.", "Disturbed the class during the lesson.",
  "Excellent participation.", "Did not bring the textbook.",
  "Volunteered to lead the group.", "Late to class after the break.",
];
const TOPIC_WORDS = ["Fundamentals of", "Introduction to", "Applications of", "Advanced", "Principles of", "Practical"];

const SUPPLIERS = [
  "Sakthi Stationers", "Kumaran Traders", "Anand Enterprises",
  "Sri Balaji Suppliers", "Vetri Agencies", "Coimbatore Lab Supplies",
  "Chennai Book House", "Gokul Furniture Works",
];
const EXPENSE_MEMOS = [
  "Monthly bill settled", "Quarterly purchase order", "Emergency replacement",
  "Term opening stock", "Annual maintenance contract", "Vendor invoice cleared",
  "Repair after inspection", "Consumables for the term",
];

const SCHOOL_COMPLAINTS = [
  "Bus arrives late at the stop almost every morning",
  "Homework load is very high this term",
  "Classroom fan is not working",
  "Child was not given the corrected answer sheet",
  "Drinking water in the corridor is not clean",
  "Request to change the section",
  "Fee receipt has the wrong amount",
  "Lunch break is too short for the younger children",
];
const COLLEGE_COMPLAINTS = [
  "Laboratory equipment is not enough for the batch size",
  "Internal marks not uploaded on the portal",
  "Hostel mess food quality has dropped",
  "Bus timing clashes with the last lab hour",
  "Wi-Fi in the library block keeps dropping",
  "Attendance shortage marked incorrectly",
  "Semester fee receipt not issued",
  "Placement training sessions overlap with classes",
];

const SCHOOL_TASKS = [
  { title: "Submit Term II mark entry", description: "Enter all subject marks on the portal before the review meeting." },
  { title: "Update the class notice board", description: "Put up the revised timetable and the exam schedule." },
  { title: "Collect consent forms for the field trip", description: "Signed forms from every parent in your class." },
  { title: "Prepare the Annual Day item", description: "Two items per class — share the theme with the coordinator." },
  { title: "Verify the attendance register", description: "Cross-check the physical register against the portal for last month." },
  { title: "Identify students needing remedial support", description: "List students below 40% in the last assessment." },
  { title: "Complete the lab stock check", description: "Confirm the science lab inventory against the register." },
  { title: "Parent-teacher meeting slot booking", description: "Confirm your availability for Saturday's PTM." },
  { title: "Submit the syllabus coverage report", description: "Percentage completion per subject for Term II." },
  { title: "Update student health records", description: "Height and weight measurements for your class." },
];
const COLLEGE_TASKS = [
  { title: "Upload CIA-II marks", description: "Internal assessment marks are due before the results meeting." },
  { title: "Submit the course file", description: "Lesson plan, question bank and CO-PO mapping for your subject." },
  { title: "Identify attendance shortage cases", description: "List students below 75% and initiate condonation." },
  { title: "Finalise the project review panel", description: "Two internal examiners per batch for the final year project." },
  { title: "Update the NAAC documentation", description: "Criterion II evidence for the current academic year." },
  { title: "Placement training attendance", description: "Confirm attendance for last week's aptitude sessions." },
  { title: "Lab manual revision", description: "Update experiments to match the revised syllabus." },
  { title: "Submit the research publication list", description: "Journal and conference papers for the annual report." },
  { title: "Industry visit approval", description: "Submit the itinerary and the student list for approval." },
  { title: "Semester feedback collation", description: "Compile the student feedback for your subjects." },
];

const SCHOOL_MEETINGS = [
  { title: "Parent-Teacher Meeting — Term II", description: "Report cards and individual discussions.", audience: "parents", audienceLabel: "All parents" },
  { title: "Staff Review — Term II Results", description: "Subject-wise performance and remedial planning.", audience: "staff", audienceLabel: "All teaching staff" },
  { title: "Annual Day Planning Committee", description: "Theme, items and rehearsal schedule.", audience: "staff", audienceLabel: "Coordinators" },
  { title: "School Management Committee", description: "Quarterly review of academics and finance.", audience: "staff", audienceLabel: "Management" },
  { title: "CBSE Inspection Preparation", description: "Documentation and infrastructure checklist.", audience: "staff", audienceLabel: "All staff" },
  { title: "Class X Board Exam Briefing", description: "Exam guidelines for students and parents.", audience: "parents", audienceLabel: "Class X parents" },
];
const COLLEGE_MEETINGS = [
  { title: "Academic Council Meeting", description: "Curriculum revision and regulation updates.", audience: "staff", audienceLabel: "Academic Council" },
  { title: "Department Review — CSE", description: "Result analysis, research output, placements.", audience: "staff", audienceLabel: "CSE faculty" },
  { title: "Placement Committee", description: "Upcoming drives and training readiness.", audience: "staff", audienceLabel: "Placement cell" },
  { title: "NAAC Steering Committee", description: "Criterion-wise progress review.", audience: "staff", audienceLabel: "NAAC team" },
  { title: "Guardian Meeting — Attendance Shortage", description: "For students below 75% attendance.", audience: "parents", audienceLabel: "Guardians (shortage list)" },
  { title: "Board of Studies — Mechanical", description: "Syllabus approval for the coming semester.", audience: "staff", audienceLabel: "BoS members" },
];

const REWARDS = [
  "Topped the class in the last assessment.",
  "Represented the institution at the state level.",
  "Consistent perfect attendance this term.",
  "Helped a classmate who was struggling with the subject.",
  "Excellent leadership as class representative.",
  "Best project in the science exhibition.",
  "Outstanding improvement since the last term.",
];
const REMARKS = [
  "Repeatedly late to the first hour.",
  "Homework not submitted for three consecutive days.",
  "Disruptive during the lesson.",
  "Attendance has dropped sharply this month.",
  "Did not bring the required materials to the lab.",
  "Incomplete record book at the practical exam.",
];

const SCHOOL_DOCS = [
  { title: "CBSE Affiliation Certificate", type: "affiliation", expiresInDays: 620, notes: "Renewal due with the board." },
  { title: "Fire Safety Certificate", type: "safety", expiresInDays: 84 },
  { title: "Building Stability Certificate", type: "safety", expiresInDays: 300 },
  { title: "Water Quality Test Report", type: "health", expiresInDays: 26, notes: "Quarterly test — renewal is close." },
  { title: "Sanitation Certificate", type: "health", expiresInDays: 145 },
  { title: "School Bus Fitness Certificates", type: "transport", expiresInDays: 41 },
  { title: "Trust Registration Deed", type: "legal", expiresInDays: null },
  { title: "12A / 80G Certificate", type: "legal", expiresInDays: 900 },
];
const COLLEGE_DOCS = [
  { title: "AICTE Approval Letter", type: "affiliation", expiresInDays: 210, notes: "Extension of approval, annual." },
  { title: "Anna University Affiliation Order", type: "affiliation", expiresInDays: 190 },
  { title: "NAAC Accreditation Certificate", type: "accreditation", expiresInDays: 1180 },
  { title: "Autonomous Status Order", type: "affiliation", expiresInDays: 800 },
  { title: "Fire Safety Certificate", type: "safety", expiresInDays: 62 },
  { title: "Hostel Licence", type: "legal", expiresInDays: 31, notes: "Renewal is due shortly." },
  { title: "Bus Fitness Certificates", type: "transport", expiresInDays: 55 },
  { title: "Anti-Ragging Compliance Affidavit", type: "legal", expiresInDays: 120 },
];

const SCHOOL_TEMPLATES = [
  { name: "Fee reminder", channel: "whatsapp", body: "Dear Parent, the {feeHead} for {studentName} ({class}) is pending. Kindly clear it at the office or via UPI. — {schoolName}" },
  { name: "Absence alert", channel: "sms", body: "{studentName} ({class}) was marked absent today. Please inform the class teacher if this was planned. — {schoolName}" },
  { name: "PTM invitation", channel: "whatsapp", body: "Parent-Teacher Meeting on {date} at {time}. Report cards will be handed over in person. — {schoolName}" },
  { name: "Holiday notice", channel: "whatsapp", body: "The school will remain closed on {date} on account of {reason}. Classes resume the next working day." },
  { name: "Exam schedule", channel: "whatsapp", body: "The {examName} timetable for {class} has been published. Please check the portal. — {schoolName}" },
  { name: "Bus delay", channel: "sms", body: "Route {route} is running about {minutes} minutes late this morning. — {schoolName}" },
];
const COLLEGE_TEMPLATES = [
  { name: "Semester fee reminder", channel: "whatsapp", body: "Dear Guardian, the {feeHead} for {studentName} ({class}) is pending. Please clear it before the examination registration closes. — {schoolName}" },
  { name: "Attendance shortage", channel: "whatsapp", body: "{studentName} ({class}) is currently at {percent}% attendance, below the 75% requirement. Please contact the department office. — {schoolName}" },
  { name: "Internal marks published", channel: "whatsapp", body: "{examName} marks for {class} are now on the portal. Re-evaluation requests close in 3 days." },
  { name: "Hostel notice", channel: "sms", body: "Hostel will be closed for the semester break from {date}. Please vacate by 10 AM." },
  { name: "Placement drive", channel: "whatsapp", body: "{company} is visiting on {date}. Eligible students must register on the portal by tomorrow." },
  { name: "Exam hall ticket", channel: "whatsapp", body: "Hall tickets for the end-semester examination are available for download. Fee clearance is mandatory." },
];

const SCHOOL_BROADCASTS = [
  { campaign: "Term II fee reminder", channel: "whatsapp", audience: "parents", audienceLabel: "Parents with dues", message: "Dear Parent, the Term II fee is now due. Kindly clear it at the office or via UPI." },
  { campaign: "PTM — Saturday", channel: "whatsapp", audience: "parents", audienceLabel: "All parents", message: "Parent-Teacher Meeting this Saturday, 9 AM to 1 PM. Report cards will be handed over in person." },
  { campaign: "Annual Day invitation", channel: "whatsapp", audience: "parents", audienceLabel: "All parents", message: "You are cordially invited to our Annual Day celebrations. Doors open at 5 PM." },
  { campaign: "Heavy rain — holiday", channel: "sms", audience: "all", audienceLabel: "Parents and staff", message: "In view of heavy rain, the school will remain closed tomorrow. Stay safe." },
  { campaign: "Half-yearly exam schedule", channel: "whatsapp", audience: "parents", audienceLabel: "Classes VI-XII", message: "The half-yearly examination timetable has been published on the portal." },
  { campaign: "Vaccination camp", channel: "whatsapp", audience: "parents", audienceLabel: "Primary parents", message: "A health check-up and vaccination camp will be held on campus next Wednesday." },
];
const COLLEGE_BROADCASTS = [
  { campaign: "Semester fee — final call", channel: "whatsapp", audience: "parents", audienceLabel: "Guardians with dues", message: "The semester fee must be cleared before examination registration closes this Friday." },
  { campaign: "Attendance shortage notice", channel: "whatsapp", audience: "parents", audienceLabel: "Shortage list", message: "Your ward's attendance is below 75%. Please meet the department office this week." },
  { campaign: "Placement drive — TCS", channel: "whatsapp", audience: "students", audienceLabel: "Final year", message: "TCS campus drive on the 22nd. Register on the placement portal by tomorrow." },
  { campaign: "End-semester timetable", channel: "whatsapp", audience: "students", audienceLabel: "All semesters", message: "The end-semester examination timetable is now available on the portal." },
  { campaign: "Technical symposium", channel: "whatsapp", audience: "students", audienceLabel: "All departments", message: "Kalanjiyam 2026 registrations are open. Twelve events across all departments." },
  { campaign: "Hostel vacating notice", channel: "sms", audience: "students", audienceLabel: "Hostel residents", message: "Hostel closes for the semester break on the 28th. Please vacate by 10 AM." },
];

const PARENT_MESSAGES = [
  "Good morning. My child will be absent tomorrow due to a medical appointment.",
  "Could you please share the fee receipt for last term?",
  "The school bus has been arriving late for the past week. Could this be looked into?",
  "I would like to meet the class teacher this week. What time would be convenient?",
  "My child has not received the corrected answer sheet for the last test.",
  "Is there a remedial class for mathematics? My child is finding it difficult.",
  "Please update our contact number in the records — we have shifted houses.",
];
const OFFICE_REPLIES = [
  "Noted, thank you for informing us. We have marked it in the register.",
  "The receipt has been emailed to you. Please check and confirm.",
  "We have spoken to the transport in-charge and it will be corrected from tomorrow.",
  "The class teacher is available on Saturday between 10 AM and 12 PM.",
  "We will follow this up with the subject teacher and revert by tomorrow.",
  "Yes, remedial sessions run every Tuesday and Thursday after the last hour.",
];

const PARENT_NOTIFS = [
  { type: "fee", title: "Fee due soon", description: "A pending fee is due within the week.", url: "fees" },
  { type: "attendance", title: "Absence recorded", description: "Your ward was marked absent today.", url: "academic" },
  { type: "exam", title: "Marks published", description: "New assessment marks are available.", url: "exams" },
  { type: "message", title: "Reply from the office", description: "The office has responded to your message.", url: "messages" },
  { type: "transport", title: "Bus reached the stop", description: "The bus has arrived at your pickup point.", url: "transport" },
  { type: "meeting", title: "Meeting scheduled", description: "A parent meeting has been scheduled.", url: "meetings" },
];
const STAFF_NOTIFS = [
  { type: "task", title: "New task assigned", description: "A task has been assigned to you.", url: "tasks" },
  { type: "leave", title: "Leave request update", description: "A leave request needs your approval.", url: "leave" },
  { type: "exam", title: "Mark entry pending", description: "Marks are pending for one of your subjects.", url: "exams" },
  { type: "complaint", title: "Complaint assigned", description: "A complaint has been assigned to you.", url: "complaints" },
  { type: "meeting", title: "Meeting reminder", description: "You have a meeting scheduled this week.", url: "meetings" },
  { type: "document", title: "Document expiring", description: "A compliance document is close to expiry.", url: "government_documents" },
];

const AUDIT_ACTIONS = [
  { action: "Sign in", entity: "Session" },
  { action: "Recorded fee payment", entity: "Fees" },
  { action: "Updated student record", entity: "Students" },
  { action: "Marked attendance", entity: "Attendance" },
  { action: "Published exam marks", entity: "Exams" },
  { action: "Created broadcast", entity: "Communication" },
  { action: "Approved leave request", entity: "Leave" },
  { action: "Added inventory item", entity: "Inventory" },
  { action: "Issued library book", entity: "Library" },
  { action: "Updated settings", entity: "Settings" },
  { action: "Issued transfer certificate", entity: "Records" },
  { action: "Added staff member", entity: "Staff" },
];

const SCHOOL_BOOKS = [
  { title: "Malgudi Days", author: "R. K. Narayan", category: "Fiction" },
  { title: "The Jungle Book", author: "Rudyard Kipling", category: "Children" },
  { title: "Wings of Fire", author: "A. P. J. Abdul Kalam", category: "Biography" },
  { title: "Ponniyin Selvan — Part I", author: "Kalki Krishnamurthy", category: "Tamil Literature" },
  { title: "The Diary of a Young Girl", author: "Anne Frank", category: "Biography" },
  { title: "Oxford School Atlas", author: "Oxford University Press", category: "Reference" },
  { title: "Panchatantra Tales", author: "Vishnu Sharma", category: "Children" },
  { title: "A Brief History of Time", author: "Stephen Hawking", category: "Science" },
  { title: "Thirukkural — With Commentary", author: "Thiruvalluvar", category: "Tamil Literature" },
  { title: "The Story of My Experiments with Truth", author: "M. K. Gandhi", category: "Biography" },
  { title: "Harry Potter and the Philosopher's Stone", author: "J. K. Rowling", category: "Fiction" },
  { title: "NCERT Science Encyclopaedia", author: "NCERT", category: "Reference" },
  { title: "Charlie and the Chocolate Factory", author: "Roald Dahl", category: "Children" },
  { title: "The Alchemist", author: "Paulo Coelho", category: "Fiction" },
  { title: "Cosmos", author: "Carl Sagan", category: "Science" },
  { title: "Indian Constitution — A Primer", author: "Subhash Kashyap", category: "Reference" },
  { title: "Sivagamiyin Sabatham", author: "Kalki Krishnamurthy", category: "Tamil Literature" },
  { title: "The Secret Seven", author: "Enid Blyton", category: "Children" },
  { title: "General Knowledge Manual", author: "Pearson", category: "Competitive" },
  { title: "Mathematics Olympiad Problems", author: "R. D. Sharma", category: "Competitive" },
  { title: "Discovery of India", author: "Jawaharlal Nehru", category: "Biography" },
  { title: "The Old Man and the Sea", author: "Ernest Hemingway", category: "Fiction" },
  { title: "Young Scientist's Handbook", author: "DK Publishing", category: "Science" },
  { title: "Kambaramayanam — Selected Verses", author: "Kambar", category: "Tamil Literature" },
];
const COLLEGE_BOOKS = [
  { title: "Introduction to Algorithms", author: "Cormen, Leiserson, Rivest, Stein", category: "Computer Science" },
  { title: "Operating System Concepts", author: "Silberschatz & Galvin", category: "Computer Science" },
  { title: "Database System Concepts", author: "Silberschatz, Korth & Sudarshan", category: "Computer Science" },
  { title: "Computer Networks", author: "Andrew S. Tanenbaum", category: "Computer Science" },
  { title: "Clean Code", author: "Robert C. Martin", category: "Computer Science" },
  { title: "Artificial Intelligence: A Modern Approach", author: "Russell & Norvig", category: "Computer Science" },
  { title: "Microelectronic Circuits", author: "Sedra & Smith", category: "Electronics" },
  { title: "Signals and Systems", author: "Oppenheim & Willsky", category: "Electronics" },
  { title: "Digital Design", author: "M. Morris Mano", category: "Electronics" },
  { title: "Principles of Communication Systems", author: "Taub & Schilling", category: "Electronics" },
  { title: "Engineering Thermodynamics", author: "P. K. Nag", category: "Mechanical" },
  { title: "Strength of Materials", author: "R. K. Bansal", category: "Mechanical" },
  { title: "Theory of Machines", author: "S. S. Rattan", category: "Mechanical" },
  { title: "Heat and Mass Transfer", author: "R. K. Rajput", category: "Mechanical" },
  { title: "Higher Engineering Mathematics", author: "B. S. Grewal", category: "Mathematics" },
  { title: "Advanced Engineering Mathematics", author: "Erwin Kreyszig", category: "Mathematics" },
  { title: "Probability and Statistics for Engineers", author: "Walpole & Myers", category: "Mathematics" },
  { title: "IEEE Transactions on Computers — Bound Volume", author: "IEEE", category: "Journals" },
  { title: "ACM Computing Surveys — Bound Volume", author: "ACM", category: "Journals" },
  { title: "Quantitative Aptitude", author: "R. S. Aggarwal", category: "Competitive" },
  { title: "GATE Computer Science Solved Papers", author: "Made Easy", category: "Competitive" },
  { title: "Let Us C", author: "Yashavant Kanetkar", category: "Computer Science" },
  { title: "Design Patterns", author: "Gamma, Helm, Johnson, Vlissides", category: "Reference" },
  { title: "Handbook of Mechanical Engineering", author: "Made Easy", category: "Reference" },
];

const SCHOOL_INVENTORY = [
  { name: "A4 Notebooks (200 pages)", category: "Stationery", price: 55 },
  { name: "Whiteboard Markers", category: "Stationery", price: 28 },
  { name: "Chalk Boxes", category: "Stationery", price: 42 },
  { name: "Chart Paper", category: "Stationery", price: 12 },
  { name: "Science Lab Beakers (250ml)", category: "Lab", price: 180 },
  { name: "Microscope Slides", category: "Lab", price: 6 },
  { name: "Bunsen Burners", category: "Lab", price: 720 },
  { name: "First Aid Kits", category: "Medical", price: 850 },
  { name: "Cricket Bats", category: "Sports", price: 1450 },
  { name: "Footballs", category: "Sports", price: 900 },
  { name: "Shuttlecocks (box)", category: "Sports", price: 480 },
  { name: "Student Desks", category: "Furniture", price: 3200 },
  { name: "Classroom Chairs", category: "Furniture", price: 1100 },
  { name: "Ceiling Fans", category: "Electrical", price: 2400 },
  { name: "LED Tube Lights", category: "Electrical", price: 380 },
  { name: "Floor Cleaning Liquid (5L)", category: "Housekeeping", price: 420 },
  { name: "Hand Wash Refill (5L)", category: "Housekeeping", price: 560 },
  { name: "Library Book Covers", category: "Library", price: 8 },
];
const COLLEGE_INVENTORY = [
  { name: "Desktop Computers (i5)", category: "Computers", price: 42000 },
  { name: "Laptop — Faculty Issue", category: "Computers", price: 58000 },
  { name: "Network Switches (24 port)", category: "Computers", price: 12500 },
  { name: "Projectors", category: "Electrical", price: 34000 },
  { name: "Oscilloscopes", category: "Laboratory", price: 48000 },
  { name: "Function Generators", category: "Laboratory", price: 18000 },
  { name: "Breadboard Kits", category: "Laboratory", price: 320 },
  { name: "Arduino Uno Boards", category: "Laboratory", price: 850 },
  { name: "Lathe Machine Tools", category: "Workshop", price: 6800 },
  { name: "Welding Rods (box)", category: "Workshop", price: 1400 },
  { name: "Safety Goggles", category: "Workshop", price: 220 },
  { name: "Lecture Hall Benches", category: "Furniture", price: 4600 },
  { name: "Staff Room Chairs", category: "Furniture", price: 2200 },
  { name: "Hostel Cots", category: "Hostel", price: 5200 },
  { name: "Hostel Mattresses", category: "Hostel", price: 2100 },
  { name: "Floor Cleaning Liquid (5L)", category: "Housekeeping", price: 420 },
  { name: "Cricket Kit — Full", category: "Sports", price: 8500 },
  { name: "Gym Equipment — Dumbbell Set", category: "Sports", price: 6400 },
];
