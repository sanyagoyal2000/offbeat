import { redirect } from "next/navigation";

/** The Saved tab was folded into Plan ("Saved for later"); old links land there. */
export default function SavedPage() {
  redirect("/plan#saved");
}
