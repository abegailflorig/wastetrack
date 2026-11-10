import {ArrowLeft,Bell} from "lucide-react";import {Link} from "react-router";
export default function TopBar({title,back="/dashboard",bell=false}:{title:string;back?:string;bell?:boolean}){
 return <header className="flex items-center justify-between px-5 pb-4 pt-6"><div className="flex items-center gap-2">{<Link to={back} className="rounded-full p-1 hover:bg-black/5"><ArrowLeft size={19}/></Link>}<h1 className="text-sm font-semibold">{title}</h1></div>{bell&&<Bell size={19}/>}</header>
}