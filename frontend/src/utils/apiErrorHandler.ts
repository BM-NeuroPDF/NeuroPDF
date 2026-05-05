export function handleApiError(status: number, showError: (msg: string) => void) {
  switch (status) {
    case 401:
      showError('Session expired. Please login again.');
      break;

    case 403:
      showError('Access denied.');
      break;

    case 500:
      showError('Server error. Please try again later.');
      break;

    default:
      showError('Unexpected error occurred.');
  }
}
