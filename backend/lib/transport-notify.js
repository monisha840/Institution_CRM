// Transport notification fan-out — turns a single advanceRoute() event
// (start / next / completed) into one notification per affected parent,
// delivered across two channels in parallel:
//
//   1. In-app    → addNotification() row, surfaces in NotificationsPanel
//                  bell + popover. Polled every 30s by the topbar.
//   2. WhatsApp  → notifyWhatsApp("transport_update", { phone, message })
//                  delivered via Evolution API. Reaches the parent's phone
//                  regardless of whether they're in the app.
//
// Design rules:
//   - Fire-and-forget per parent — one parent's failure must never block
//     another's delivery, and the whole dispatch must never block / fail
//     the underlying bus-advance call (caller wraps this in try/catch).
//   - De-dupe per parent — sibling students at the same stop produce ONE
//     notification, not two.
//   - Direction-aware — for evening routes, read transportEvening +
//     pickupStopEvening. Morning + "both" use the legacy transport/pickupStop.
//   - "Completed" notifies every parent on the route in that direction.
//     Other events ("started" / "departed") notify only parents whose
//     child is at the upcoming stop.

import { addNotification, listUsers, readAllData } from "./db.js";

// Build the per-event WhatsApp + in-app copy. Kept here (not in component
// land) so the same wording is used regardless of channel.
function buildMessages({ event, route, direction }) {
  const eta = event.toStop?.t && event.toStop.t !== "—" ? event.toStop.t : null;
  const routeLabel = route.code + (route.name && route.name !== route.code ? ` · ${route.name}` : "");
  const directionLabel = direction === "evening" ? "evening drop" : "morning pickup";

  if (event.type === "started") {
    return {
      title: "🚌 Transport started",
      description: `${routeLabel} · running · first stop: ${event.toStopName}${eta ? ` · ETA ${eta}` : ""}`,
      // Goes to EVERY parent on this route (not just first-stop parents),
      // so phrase it as a "bus is now running" message — they'll get a
      // second message when the bus actually approaches their child's stop.
      whatsapp:
        `🚌 *Transport Started*\n\n` +
        `The school vehicle has just started today's ${directionLabel} route.\n\n` +
        `🚏 First stop: *${event.toStopName}*\n` +
        (eta ? `🕒 First-stop ETA: *${eta}*\n` : "") +
        `\nYou'll get another message when the bus reaches your child's stop. Please have them ready by then.`,
    };
  }
  if (event.type === "departed") {
    return {
      title: "🚌 Vehicle update",
      description: `${routeLabel} · next: ${event.toStopName}${eta ? ` · ETA ${eta}` : ""}`,
      whatsapp:
        `🚌 *Transport Update*\n\n` +
        `The school vehicle has departed from *${event.fromStopName}*.\n\n` +
        `🚏 Next Stop: *${event.toStopName}*\n` +
        (eta ? `🕒 Expected Arrival: *${eta}*\n` : "") +
        `\nPlease have your child ready.`,
    };
  }
  if (event.type === "completed") {
    return {
      title: "✅ Route completed",
      description: `${routeLabel} · ${directionLabel} done`,
      whatsapp:
        `✅ *Route Completed*\n\n` +
        (direction === "morning"
          ? `The morning pickup route has been completed successfully.\nAll boarded students have safely reached the school.`
          : `The evening drop route has been completed successfully.\nAll students have been dropped at their stops.`),
    };
  }
  return null;
}

// Pick the students who should trigger a notification for this event.
//
//   "started"               → EVERY student on this route (the bus has just
//                             left school — all parents on this route want
//                             to know it's now in motion, not just the
//                             first-stop parents)
//   "departed"              → students at the upcoming stop (event.toStopName)
//                             in the direction matching the route
//   "completed"             → every student on this route in that direction
function selectTargetStudents({ allStudents, route, event, direction }) {
  const routeFieldOf = (s) => direction === "evening" ? s.transportEvening : s.transport;
  const stopFieldOf  = (s) => direction === "evening" ? s.pickupStopEvening : s.pickupStop;

  if (event.type === "started" || event.type === "completed") {
    return allStudents.filter((s) => routeFieldOf(s) === route.code);
  }
  const target = event.toStopName;
  if (!target) return [];
  return allStudents.filter((s) => routeFieldOf(s) === route.code && stopFieldOf(s) === target);
}

// Public entry point. The caller (the /api/transport/advance API route)
// invokes this AFTER advanceRoute() succeeds. Always swallows its own
// errors — never throws — so a downstream notification glitch can't break
// the teacher's "Mark stop done" tap.
//
// Channel policy: IN-APP ONLY for transport events. WhatsApp was disabled
// because parents already get a full-screen pop-up on their dashboard
// (TransportEventPopup) when a transport notification arrives, plus the
// persistent bell-icon history. Per-stop WhatsApps were too spammy
// (4-6 messages per child per day across both legs). Manual broadcasts
// from the route header still use WhatsApp — that's a different path.
//
// Returns a summary object useful for tests / logging:
//   { dispatched, inAppOk, inAppFail, skippedNoParent }
export async function dispatchTransportNotifications(route, event) {
  const empty = { dispatched: 0, inAppOk: 0, inAppFail: 0, skippedNoParent: 0 };
  if (!route || !event || !event.type) return empty;

  const direction = route.direction === "evening" ? "evening" : "morning";
  const msgs = buildMessages({ event, route, direction });
  if (!msgs) return empty;

  let allStudents = [];
  let allUsers = [];
  try {
    // readAllData() is the existing one-shot bundle. Pulling it here means we
    // share the same query path the rest of the app uses; cheap enough at
    // school-scale (~300 students, ~50 users).
    const data = await readAllData();
    allStudents = data.addedStudents || [];
    allUsers = data.users || (await listUsers().catch(() => []));
  } catch (e) {
    console.warn(`[transport-notify] could not load data: ${e.message}`);
    return empty;
  }

  const targets = selectTargetStudents({ allStudents, route, event, direction });
  if (!targets.length) return empty;

  // Index parents by linked student id. Each student has at most one
  // parent user (created at admission via "Issue parent login").
  const parentByStudent = new Map();
  for (const u of allUsers) {
    if (u.role === "parent" && u.linkedId) parentByStudent.set(u.linkedId, u);
  }

  // De-dupe per parent (siblings at the same stop → one notification).
  // Key prefers the parent user id; falls back to phone for parents who
  // don't have a login yet but do have a phone on the student row.
  const seen = new Set();
  const fanout = [];
  for (const s of targets) {
    const parent = parentByStudent.get(s.id);
    const phone = s.parent && s.parent !== "—" ? s.parent : null;
    if (!parent && !phone) {
      empty.skippedNoParent += 1;
      continue;
    }
    const key = parent?.id || `phone:${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fanout.push({
      parentUserId: parent?.id || null,
      phone,
      studentName: s.name,
    });
  }

  empty.dispatched = fanout.length;

  // Fan out — independent per parent, errors logged but not thrown.
  // In-app only: surfaced as a full-screen pop-up on the parent dashboard
  // (see frontend/components/TransportEventPopup.jsx) and in the bell
  // history list.
  await Promise.all(fanout.map(async (t) => {
    if (!t.parentUserId) return; // no login → can't deliver in-app
    try {
      await addNotification({
        userId: t.parentUserId,
        type: "transport",
        title: msgs.title,
        description: msgs.description,
        redirectUrl: "?screen=dashboard",
      });
      empty.inAppOk += 1;
    } catch (e) {
      empty.inAppFail += 1;
      console.warn(`[transport-notify] in-app for ${t.parentUserId} failed: ${e.message}`);
    }
  }));

  return empty;
}
