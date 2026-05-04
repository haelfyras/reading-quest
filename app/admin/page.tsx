import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminConfigured, verifyAdminSessionToken } from "../../lib/adminAuth";
import AdminConsole from "./AdminConsole";
import AdminLogin from "./AdminLogin";

export default function AdminPage() {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  const authenticated = verifyAdminSessionToken(token);

  return authenticated ? <AdminConsole /> : <AdminLogin configured={isAdminConfigured()} />;
}
