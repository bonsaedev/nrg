/** Error class for NRG framework errors (validation failures, registration errors, etc.). */
class NrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NrgError";
    Object.setPrototypeOf(this, NrgError.prototype);
  }
}

export { NrgError };
