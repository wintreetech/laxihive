export function requiresEmailVerification(env = process.env) {
  return env.REQUIRE_EMAIL_VERIFICATION !== "false";
}
export function customerEmailAllowed(verified: boolean, env = process.env) {
  return verified || !requiresEmailVerification(env);
}
export function emailDeliveryAvailable(env = process.env) {
  return (
    !!(env.SMTP_HOST && env.MAIL_FROM) ||
    ["test", "development"].includes(env.NODE_ENV || "development")
  );
}
export function assertAccountEmailConfiguration(env = process.env) {
  if (
    env.NODE_ENV === "production" &&
    requiresEmailVerification(env) &&
    !emailDeliveryAvailable(env)
  )
    throw new Error(
      "Production requires SMTP_HOST and MAIL_FROM when mandatory email verification is enabled.",
    );
}
