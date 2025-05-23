import { getAnnouncements } from "../_lib/actions";
import AnnouncementBanner from "./AnnouncementBanner";

export default async function Announcement() {
  const announcements = await getAnnouncements();

  return <AnnouncementBanner announcements={announcements} />;
}
