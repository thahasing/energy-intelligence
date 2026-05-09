import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/layout/Layout'
import ProjectCard from '@/components/project/ProjectCard'
import DetailPanel from '@/components/project/DetailPanel'
import { getStats, searchProjects } from '@/lib/api'
import type { Project } from '@/lib/api'

const TYPE_COLORS: Record<string,string> = { solar:'#f59e0b', wind:'#06b6d4', battery:'#8b5cf6', hydro:'#0ea5e9' }
const TYPE_ICONS: Record<string,string> = { solar:'☀️', wind:'💨', battery:'🔋', hydro:'💧' }

export default function DashboardPage() {
  const [selected, setSelected] = React.useState<Project|null>(null)
  const {data:stats,isLoading:sl} = useQuery({queryKey:['stats'],queryFn:getStats,refetchInterval:30000})
  const {data:recent,isLoading:pl} = useQuery({queryKey:['recent'],queryFn:()=>searchProjects({page:1,page_size:9}),refetchInterval:30000})

  const typeData = stats
    ? Object.entries(stats.by_type).filter(([k])=>['solar','wind','battery','hydro'].includes(k)).map(([k,v])=>({name:k,value:v as number,color:TYPE_COLORS[k]||'#64748b'}))
    : []
  const total = typeData.reduce((a,b)=>a+b.value,0)||1
  const stateEntries = stats ? Object.entries(stats.top_states).slice(0,5) : []
  const maxState = stateEntries.length ? Math.max(...stateEntries.map(([,v])=>v as number)) : 1

  return (
    <Layout>
      <Head><title>Dashboard · EnergyIQ</title></Head>
      <div style={{display:'flex',gap:0,minHeight:'calc(100vh - 56px)',alignItems:'flex-start'}}>
        <div style={{flex:1,minWidth:0}}>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
            <StatCard label="Total Projects" icon="⚡" value={stats?.total_projects??0} sub="EIA verified & operational" loading={sl}/>
            <StatCard label="Solar" icon="☀️" value={stats?.by_type?.solar??0} sub="Photovoltaic facilities" loading={sl} color="#f59e0b"/>
            <StatCard label="Wind" icon="💨" value={stats?.by_type?.wind??0} sub="Onshore wind farms" loading={sl} color="#06b6d4"/>
            <StatCard label="Battery + Hydro" icon="🔋" value={(stats?.by_type?.battery??0)+(stats?.by_type?.hydro??0)} sub="Storage & hydropower" loading={sl} color="#8b5cf6"/>
          </div>

          {/* Charts */}
          <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:12,marginBottom:20}}>
            <div className="card">
              <div className="card-title">By Type</div>
              {sl?<div className="skeleton" style={{height:160}}/>:(
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg3)" strokeWidth="14"/>
                    {(()=>{let cum=0;const circ=2*Math.PI*38;return typeData.map((d,i)=>{const pct=(d.value/total)*100;const off=cum;cum+=pct;return(<circle key={i} cx="50" cy="50" r="38" fill="none" stroke={d.color} strokeWidth="14" strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeDashoffset={`${-((off/100)*circ)+circ/4}`} transform="rotate(-90 50 50)"/>)})})()}
                  </svg>
                  <div style={{width:'100%',display:'flex',flexDirection:'column',gap:7}}>
                    {typeData.map((d,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                        <span style={{fontSize:15}}>{TYPE_ICONS[d.name]}</span>
                        <span style={{flex:1,color:'var(--t2)',fontWeight:500,textTransform:'capitalize'}}>{d.name}</span>
                        <span style={{color:d.color,fontFamily:'var(--font-mono)',fontWeight:700,fontSize:13}}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-title">Top States by Project Count</div>
              {sl?<div className="skeleton" style={{height:160}}/>:(
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {stateEntries.map(([k,v],i)=>(
                    <div key={i} className="bar-row">
                      <div className="bar-label">{k||'?'}</div>
                      <div className="bar-track"><div className="bar-fill" style={{width:`${((v as number)/maxState)*100}%`}}/></div>
                      <div className="bar-count">{v as number}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Projects */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:'var(--tw)',letterSpacing:'-.01em'}}>Recent Projects</div>
            <Link href="/search" style={{fontSize:12,color:'var(--blue)',textDecoration:'none',fontWeight:600}}>View all {stats?.total_projects||''} projects →</Link>
          </div>
          {pl?(
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {Array.from({length:9}).map((_,i)=><div key={i} className="skeleton" style={{height:170,borderRadius:12}}/>)}
            </div>
          ):(
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {recent?.results.map(p=>(
                <ProjectCard key={p.id} project={p} selected={selected?.id===p.id}
                  onSelect={()=>setSelected(selected?.id===p.id?null:p)}/>
              ))}
            </div>
          )}
        </div>

        {selected&&<DetailPanel project={selected} onClose={()=>setSelected(null)}/>}
      </div>
    </Layout>
  )
}

function StatCard({label,value,sub,icon,loading,color}:any) {
  return (
    <div className="stat-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div className="stat-label">{label}</div>
        <span className="stat-icon">{icon}</span>
      </div>
      {loading?<div className="skeleton" style={{height:36,width:'55%'}}/>
        :<div className="stat-val" style={color?{color}:{}}>{(value as number).toLocaleString()}</div>}
      <div className="stat-sub">{sub}</div>
    </div>
  )
}
