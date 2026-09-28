/**
 * The username as shown in the toolbar: first letter capitalised ("demo" -> "Demo").
 * Display only: the token and API keep the real value.
 */
export function displayName(username: string): string {
  return username.charAt(0).toUpperCase() + username.slice(1);
}
