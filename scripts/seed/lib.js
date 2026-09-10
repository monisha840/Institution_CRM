// Shared building blocks for the tenant seeders.
//
// Everything here is deterministic. The generators are driven by a seeded
// PRNG, so re-running the seeder reproduces the same students, the same ids
// and the same login addresses. That matters more than it sounds: a demo
// that reshuffles every roster on each run makes screenshots, saved links
// and written-down credentials go stale, and makes "did my change break
// this?" impossible to answer.

// ---------------------------------------------------------------------------
// Deterministic randomness — mulberry32, seeded from a string.
// ---------------------------------------------------------------------------
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function rng(seedText) {
  let a = hashSeed(String(seedText));
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer in [min, max] inclusive. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** One element of an array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** n distinct elements, or the whole array if it is shorter. */
    sample: (arr, n) => {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, Math.min(n, copy.length));
    },
    /** True with probability p. */
    chance: (p) => next() < p,
    /**
     * A value clustered around `mean` rather than spread flat across the
     * range — real attendance percentages and real marks bunch up, and a
     * uniform spread is the tell that a dataset was generated.
     */
    around: (mean, spread, min, max) => {
      const v = mean + (next() + next() + next() - 1.5) * spread;
      return Math.max(min, Math.min(max, Math.round(v)));
    },
  };
}

// ---------------------------------------------------------------------------
// Name pools — Tamil Nadu weighted, which is where both institutions are.
// ---------------------------------------------------------------------------
export const BOY_NAMES = [
  "Aarav", "Vihaan", "Aditya", "Karthik", "Arjun", "Rohan", "Nikhil", "Surya",
  "Vignesh", "Hari", "Ashwin", "Pranav", "Sanjay", "Dhruv", "Rahul", "Vikram",
  "Manoj", "Ajay", "Balaji", "Naveen", "Sathish", "Gokul", "Praveen", "Yuvan",
  "Kishore", "Dinesh", "Barath", "Aravind", "Mukesh", "Jeeva", "Tarun", "Sidharth",
  "Akash", "Charan", "Deepak", "Ganesh", "Hemanth", "Jagan", "Kamal", "Lokesh",
];

export const GIRL_NAMES = [
  "Diya", "Ananya", "Meera", "Kavya", "Nithya", "Priya", "Sneha", "Divya",
  "Aishwarya", "Harini", "Janani", "Keerthi", "Lavanya", "Madhumitha", "Nandhini",
  "Pavithra", "Ramya", "Sowmya", "Swetha", "Vaishnavi", "Yamini", "Abinaya",
  "Bhavana", "Charulatha", "Deepika", "Gayathri", "Ishwarya", "Kalpana", "Malini",
  "Nivetha", "Poornima", "Revathi", "Sahana", "Tamilselvi", "Uma", "Varsha",
  "Anjali", "Bhuvana", "Devika", "Indhu",
];

export const SURNAMES = [
  "Sharma", "Iyer", "Krishnan", "Venkatesh", "Murthy", "Raman", "Subramanian",
  "Nair", "Pillai", "Reddy", "Rajan", "Kumar", "Balan", "Sundaram", "Natarajan",
  "Chandran", "Gopal", "Mohan", "Prasad", "Srinivasan", "Anand", "Bala",
  "Ganesan", "Hariharan", "Jayaraman", "Kannan", "Lakshmanan", "Mani",
  "Narayanan", "Palani", "Ravi", "Selvam", "Thangaraj", "Varadhan",
];

export const FATHER_NAMES = [
  "Suresh", "Ramesh", "Mahesh", "Prakash", "Senthil", "Murugan", "Anbu",
  "Kalyan", "Vasanth", "Elango", "Shankar", "Bhaskar", "Chandrasekar",
  "Dhanapal", "Ezhilarasan", "Gopinath", "Jayakumar", "Kumaravel", "Loganathan",
  "Muthukumar", "Nagarajan", "Perumal", "Rajendran", "Sivakumar", "Thirumalai",
];

export const MOTHER_NAMES = [
  "Lakshmi", "Saraswathi", "Padma", "Kalaivani", "Vasanthi", "Jayanthi",
  "Chitra", "Devi", "Geetha", "Hemalatha", "Indira", "Kasthuri", "Malathi",
  "Nirmala", "Parvathi", "Radha", "Sumathi", "Tamilarasi", "Usha", "Vijaya",
];

/** A full student name — first name plus a family name. */
export function personName(r, gender) {
  const first = r.pick(gender === "f" ? GIRL_NAMES : BOY_NAMES);
  return `${first} ${r.pick(SURNAMES)}`;
}

/** A guardian whose surname matches the child's, the way families work. */
export function guardianFor(r, studentName) {
  const surname = studentName.split(" ").slice(-1)[0];
  const isFather = r.chance(0.62);
  const first = isFather ? r.pick(FATHER_NAMES) : r.pick(MOTHER_NAMES);
  return { name: `${first} ${surname}`, relation: isFather ? "Father" : "Mother" };
}

// ---------------------------------------------------------------------------
// Phone numbers — valid Indian mobile shape (10 digits starting 6-9).
// ---------------------------------------------------------------------------
export function mobile(r) {
  const first = r.pick(["6", "7", "8", "9"]);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += r.int(0, 9);
  return `+91 ${first}${rest.slice(0, 4)} ${rest.slice(4)}`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
export const iso = (d) => d.toISOString().slice(0, 10);
export const isoTs = (d) => d.toISOString();

export function daysAgo(from, n) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function addDays(from, n) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Sunday = 0. Indian schools and colleges work a six-day week. */
export const isSunday = (d) => d.getUTCDay() === 0;

/**
 * The last `count` working days ending at `end`, newest last.
 *
 * Skips Sundays and anything in `holidays`, so an attendance register built
 * from these dates has no rows on days the institution was shut — which is
 * what makes the attendance percentages add up when a screen divides by
 * working days.
 */
export function workingDaysBack(end, count, holidays = new Set()) {
  const out = [];
  let cursor = new Date(end);
  let guard = 0;
  while (out.length < count && guard++ < count * 3) {
    if (!isSunday(cursor) && !holidays.has(iso(cursor))) out.push(new Date(cursor));
    cursor = daysAgo(cursor, 1);
  }
  return out.reverse();
}

/** "12 Aug 2026" — how dates read in the UI. */
export function humanDate(d) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** "2 days ago" / "just now" — for activity feeds and audit rows. */
export function relativeLabel(then, now) {
  const mins = Math.round((now - new Date(then)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return humanDate(then);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
/** Round to the nearest 50 — institutions quote round fee figures. */
export const roundFee = (n) => Math.round(n / 50) * 50;

// ---------------------------------------------------------------------------
// Id helpers — each institution gets its own prefix so that even though the
// tenant column is what separates them, an id is self-describing in a log.
// ---------------------------------------------------------------------------
export const pad = (n, width = 3) => String(n).padStart(width, "0");
