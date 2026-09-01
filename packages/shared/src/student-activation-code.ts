/** Crockford Base32 alphabet: case-insensitive and free of I, L, O, and U. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const STUDENT_ACTIVATION_CODE_BYTES = 10;
export const STUDENT_ACTIVATION_CODE_LENGTH = 16;

/** Encode exactly 80 random bits as 16 canonical Crockford Base32 symbols. */
export function encodeStudentActivationCode(bytes: Uint8Array): string {
  if (bytes.length !== STUDENT_ACTIVATION_CODE_BYTES) {
    throw new RangeError(
      `Student activation codes require exactly ${STUDENT_ACTIVATION_CODE_BYTES} bytes`,
    );
  }

  let buffer = 0;
  let bufferedBits = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bufferedBits += 8;
    while (bufferedBits >= 5) {
      bufferedBits -= 5;
      output += CROCKFORD_ALPHABET[(buffer >>> bufferedBits) & 31];
      // Keep only unread bits so bitwise operations never accumulate beyond a
      // safe 32-bit window. Eight input bits plus at most four retained bits fit.
      buffer &= (1 << bufferedBits) - 1;
    }
  }
  if (bufferedBits !== 0 || output.length !== STUDENT_ACTIVATION_CODE_LENGTH) {
    throw new Error("Student activation code encoding invariant failed");
  }
  return output;
}

/**
 * Canonicalize a student-entered activation code.
 *
 * Hyphens and whitespace are display separators. Crockford's O, I, and L
 * aliases become 0 and 1. U and every other non-alphabet character fail closed.
 */
export function normalizeStudentActivationCode(input: string): string | null {
  let canonical = "";
  for (const rawCharacter of input.normalize("NFKC").toUpperCase()) {
    if (rawCharacter === "-" || /\s/.test(rawCharacter)) continue;
    const character =
      rawCharacter === "O"
        ? "0"
        : rawCharacter === "I" || rawCharacter === "L"
          ? "1"
          : rawCharacter;
    if (!CROCKFORD_ALPHABET.includes(character)) return null;
    canonical += character;
    if (canonical.length > STUDENT_ACTIVATION_CODE_LENGTH) return null;
  }
  return canonical.length === STUDENT_ACTIVATION_CODE_LENGTH ? canonical : null;
}
