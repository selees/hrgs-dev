export function handleError(error: unknown, defaultMessage: string) {
    if (error instanceof Error) {
      console.error(error.message);
      alert(error.message);
    } else {
      console.error(defaultMessage);
      alert(defaultMessage);
    }
  }