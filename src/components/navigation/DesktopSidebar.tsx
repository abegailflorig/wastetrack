import {CalendarDays,ClipboardList,Home,MapPin,PlusCircle,UserRound} from "lucide-react";
import {Link,useLocation} from "react-router";
export default function DesktopSidebar(){
 const loc=useLocation(); const links=[["/dashboard","Dashboard",Home],["/calendar","Calendar",CalendarDays],["/report-waste","Report Waste",PlusCircle],["/reports","My Reports",ClipboardList]];
 return <aside className="desktop-sidebar sticky top-0 h-screen w-64 shrink-0 flex-col bg-white p-5 shadow-lg">
  <div className="flex items-center gap-3 border-b pb-5"><img src="/src/assets/waste-logo.png" className="h-10 w-10 rounded-lg object-cover"/><div><b className="text-red-600">Waste Track</b><p className="text-xs text-neutral-500">Solid Waste Monitor</p></div></div>
  <nav className="mt-8 space-y-2">{links.map(([to,label,Icon])=><Link key={String(to)} to={String(to)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${loc.pathname.startsWith(String(to))?"bg-red-600 text-white":"hover:bg-red-50"}`}><Icon size={18}/></Link>)}</nav>
  <div className="mt-auto border-t pt-4"><Link to="/login" className="flex items-center gap-3 text-sm text-neutral-600"><UserRound size={18}/>Account / Login</Link></div>
 </aside>
}