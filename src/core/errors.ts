class NrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NrgError";
    Object.setPrototypeOf(this, NrgError.prototype);
  }
}

export { NrgError };
