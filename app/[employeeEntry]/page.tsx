import type {Metadata,Viewport} from 'next';
import {notFound} from 'next/navigation';
import StaffPortal from '../staff-portal';
export const metadata:Metadata={title:'Santa Cor · Equipe',robots:{index:false,follow:false},referrer:'no-referrer'};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#362326'};
export const dynamic='force-dynamic';
export default async function StaffPage({params}:{params:Promise<{employeeEntry:string}>}){
 const {employeeEntry}=await params;
 if(!/^funcionarios-[a-f0-9]{48}$/.test(employeeEntry))notFound();
 return <StaffPortal token={employeeEntry.slice('funcionarios-'.length)}/>;
}
