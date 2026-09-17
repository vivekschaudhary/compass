import { redirect } from "next/navigation";

// `/` was v1's dashboard. The app lives under /v2, so the root sends you to the project list rather
// than to a 404.
export default function Root() {
  redirect("/v2/projects");
}
