export default function miniInvariant(
  condition: any,
  message: string | (() => string)
): asserts condition {
  if (condition) {
    return;
  }
  throw new Error(
    `Invariant Violation: ${typeof message === "string" ? message : message()}`
  );
}
