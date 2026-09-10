// Generated passwords for accounts the app provisions on someone's behalf.
//
// Every login this system creates automatically — a teacher from a staff
// import, a guardian from an admission — used to get a password derived
// from the person's own name: "Aakash@123", "Priya@123". Easy to read out
// over the phone, and equally easy for anyone holding a class list to
// guess, which on a parent portal means reading another family's fees,
// attendance and messages.
//
// These are random instead, and short enough to still dictate over a phone.
// The plain text is returned to the admin exactly once, at creation, and
// only the bcrypt hash is stored.

// Deliberately excludes 0/O/1/l/I — the characters people mishear and
// mistype when a password is read aloud in an office.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A random password.
 *
 * Uses the platform CSPRNG. Falls back to Math.random only if crypto is
 * somehow unavailable, which is not a situation we expect but is better
 * than throwing in the middle of an admission.
 */
export function generatePassword(length = 12) {
  let bytes;
  try {
    bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  } catch {
    bytes = Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));
  }
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Grouped into blocks of four, which is markedly easier to read back
 * accurately than an unbroken run of twelve characters.
 *
 *   generatePassword()        ->  "k7QmR2xnP4wt"
 *   readablePassword()        ->  "k7Qm-R2xn-P4wt"
 */
export function readablePassword(blocks = 3, blockSize = 4) {
  const raw = generatePassword(blocks * blockSize);
  const parts = [];
  for (let i = 0; i < raw.length; i += blockSize) parts.push(raw.slice(i, i + blockSize));
  return parts.join("-");
}
