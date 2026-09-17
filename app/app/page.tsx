import { redirect } from "next/navigation";

// There is no page at `/`; the project list is where the app starts.
export default function Root() {
  redirect("/projects");
}
