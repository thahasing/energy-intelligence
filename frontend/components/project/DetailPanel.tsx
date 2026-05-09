import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProject } from '@/lib/api'
import type { Project } from '@/lib/api'
import { formatMW, locationString, getTypeIcon, getTypeBadge, getLifecycleBadge, PROJECT_TYPE_CONFIG, LIFECYCLE_CONFIG } from '@/lib/utils'

const STEPS = ['Planned','Approved','Construction','Operational']
const STEP_MAP: Record<string,number> = { planned:0, approved:1, under_construction:2, operational:3 }
const TYPE_COLORS: Record<string,string> = { solar:'#f59e0b', wind:'#06b6d4', battery:'#8b5cf6', hydro:'#0ea5e9' }

function srcMeta(url:string) {
  const u=(url||'').toLowerCase()
  if(u.includes('eia.gov')||u.includes('opendata'))  return {label:'EIA Form 860',  icon:'🏛️',color:'#2563eb'}
  if(u.includes('elibrary')||u.includes('ferc.gov')) return {label:'FERC eLibrary', icon:'⚡', color:'#7c3aed'}
  if(u.includes('eplanning')||u.includes('blm.gov')) return {label:'BLM / NEPA',   icon:'🌿',color:'#16a34a'}
  if(u.includes('sec.gov')||u.includes('efts.sec'))  return {label:'SEC EDGAR',    icon:'📄',color:'#dc2626'}
  return {label:'Source Document',icon:'🔗',color:'#64748b'}
}

interface Props { project:Project; onClose:()=>void }

export default function DetailPanel({ project:p, onClose }:Props) {
  const [tab,setTab] = React.useState<'overview'|'map'|'sources'>('overview')
  const mapRef = React.useRef<HTMLDivElement>(null)
  const mapInst = React.useRef<any>(null)

  const {data:full,isLoading} = useQuery({
    queryKey:['project',p.id],
    queryFn:()=>getProject(p.id),
    enabled:!!p.id,
  })
  const proj = full||p
  const curStep = STEP_MAP[proj.lifecycle_stage||'']??3

  const allSources = React.useMemo(()=>{
    if(!full?.extracted_fields) return []
    const seen=new Set<string>(); const out:any[]=[]
    for(const ef of full.extracted_fields)
      for(const src of (ef.sources||[]))
        if(src.source_url&&!seen.has(src.source_url)){seen.add(src.source_url);out.push({...src,field_name:ef.field_name})}
    return out
  },[full])

  React.useEffect(()=>{
    if(mapInst.current){mapInst.current.remove();mapInst.current=null}
    setTab('overview')
  },[p.id])

  React.useEffect(()=>{
    if(tab!=='map'||!mapRef.current||mapInst.current||typeof window==='undefined') return
    if(!proj.latitude||!proj.longitude) return
    const L=require('leaflet')
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })
    const map=L.map(mapRef.current,{zoomControl:true,scrollWheelZoom:false})
      .setView([proj.latitude,proj.longitude],8)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map)
    const color=TYPE_COLORS[proj.project_type]||'#2563eb'
    const icon=L.divIcon({className:'',html:`<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>`,iconSize:[18,18],iconAnchor:[9,9]})
    L.marker([proj.latitude,proj.longitude],{icon}).addTo(map)
      .bindPopup(`<div style="font-family:Inter,sans-serif"><b style="font-size:13px">${proj.project_name}</b><br/><span style="font-size:11px;color:#64748b">${proj.project_type} · ${proj.capacity_mw||'?'} MW · ${proj.state}, USA</span></div>`)
      .openPopup()
    mapInst.current=map
  },[tab,proj.latitude,proj.longitude])

  return (
    <div className="detail-panel fade-in">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>

      {/* Header */}
      <div className="dp-header">
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
            <div style={{width:40,height:40,borderRadius:10,flexShrink:0,background:`${TYPE_COLORS[proj.project_type]||'#2563eb'}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>
              {getTypeIcon(proj.project_type)}
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--tw)',lineHeight:1.3,letterSpacing:'-.02em'}}>{proj.project_name}</div>
              <div style={{fontSize:11,color:'var(--t3)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{proj.owner_company||'—'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'var(--bg3)',border:'none',color:'var(--t2)',cursor:'pointer',fontSize:18,width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
        </div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:10}}>
          {proj.project_type&&<span className={`badge ${getTypeBadge(proj.project_type)}`}>{PROJECT_TYPE_CONFIG[proj.project_type]?.label||proj.project_type}</span>}
          {proj.lifecycle_stage&&<span className={`badge ${getLifecycleBadge(proj.lifecycle_stage)}`}>{LIFECYCLE_CONFIG[proj.lifecycle_stage]?.label||proj.lifecycle_stage}</span>}
          {proj.capacity_mw&&<span className="badge badge-blue">{formatMW(proj.capacity_mw)}</span>}
        </div>
      </div>

      <div className="dp-body">
        {/* Timeline */}
        <div className="dp-section">
          <div className="dp-section-title">Project Lifecycle</div>
          <div className="tl-wrap">
            {STEPS.map((label,i)=>{
              const state=i<curStep?'done':i===curStep?'active':'future'
              return (
                <React.Fragment key={label}>
                  <div className="tl-step">
                    <div className={`tl-node ${state}`}>
                      {state==='done'?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                       :state==='active'?<div style={{width:8,height:8,borderRadius:'50%',background:'var(--blue)'}}/>
                       :<div style={{width:5,height:5,borderRadius:'50%',background:'var(--t4)'}}/>}
                    </div>
                    <div className={`tl-label ${state}`}>{label}</div>
                  </div>
                  {i<STEPS.length-1&&<div className={`tl-connector ${i<curStep?'done':'future'}`}/>}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-bar">
          {(['overview','map','sources'] as const).map(t=>(
            <button key={t} className={`tab-btn ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
              {t==='overview'?'📋 Overview':t==='map'?'🗺️ Map':`📎 Sources${allSources.length?` (${allSources.length})`:''}`}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab==='overview'&&(
          <div>
            {[
              {label:'Capacity',value:formatMW(proj.capacity_mw)},
              {label:'State',value:proj.state||'—'},
              {label:'Country',value:proj.country||'USA'},
              {label:'Type',value:proj.project_type||'—'},
              {label:'Lifecycle',value:(proj.lifecycle_stage||'—').replace(/_/g,' ')},
              {label:'Owner',value:proj.owner_company||'—'},
            ].map(({label,value})=>(
              <div key={label} className="data-row">
                <span className="data-label">{label}</span>
                <span className="data-val">{value}</span>
              </div>
            ))}
            <div style={{marginTop:16,marginBottom:8}}><div className="dp-section-title">Approvals & Compliance</div></div>
            {[
              {label:'Environmental Approval',val:proj.environmental_approval,src:'NEPA / BLM'},
              {label:'Grid Connection (FERC)',val:proj.grid_connection_approval,src:'FERC eLibrary'},
              {label:'Financing Secured',val:proj.financing_secured,src:'SEC EDGAR'},
            ].map(({label,val,src})=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--card-border)',gap:8}}>
                <div>
                  <div style={{fontSize:12,color:'var(--t2)',fontWeight:500}}>{label}</div>
                  <div style={{fontSize:10,color:'var(--t4)',marginTop:1}}>via {src}</div>
                </div>
                <span className={`approval-pill ${val?'approval-yes':'approval-no'}`}>{val?'✓ Confirmed':'— Pending'}</span>
              </div>
            ))}
            {proj.overall_confidence!=null&&(
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontSize:12}}>
                <span style={{color:'var(--t3)',fontWeight:500}}>Data Confidence</span>
                <span style={{color:'var(--blue)',fontFamily:'var(--font-mono)',fontWeight:700,fontSize:14}}>{Math.round(proj.overall_confidence*100)}%</span>
              </div>
            )}
          </div>
        )}

        {/* MAP */}
        {tab==='map'&&(
          <div>
            {proj.latitude&&proj.longitude?(
              <>
                <div ref={mapRef} style={{height:300,borderRadius:10,overflow:'hidden',border:'1px solid var(--card-border)',marginBottom:10}}/>
                <div style={{fontSize:11,color:'var(--t3)',fontFamily:'var(--font-mono)',marginBottom:4}}>
                  📍 {proj.latitude.toFixed(4)}°N, {Math.abs(proj.longitude).toFixed(4)}°{proj.longitude<0?'W':'E'} · {proj.state}, USA
                </div>
                <div style={{fontSize:10,color:'var(--t4)'}}>Coordinates are state-level estimates from EIA data</div>
              </>
            ):(
              <div style={{height:200,border:'1px solid var(--card-border)',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,background:'var(--bg2)'}}>
                <span style={{fontSize:36}}>📍</span>
                <div style={{fontSize:13,color:'var(--t3)',fontWeight:500}}>Location not available</div>
                <div style={{fontSize:11,color:'var(--t4)'}}>State: {proj.state||'—'}</div>
              </div>
            )}
          </div>
        )}

        {/* SOURCES */}
        {tab==='sources'&&(
          <div>
            {isLoading?(
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[1,2,3,4].map(i=><div key={i} className="skeleton" style={{height:90,borderRadius:10}}/>)}
              </div>
            ):allSources.length===0?(
              <div style={{textAlign:'center',padding:'40px 0'}}>
                <div style={{fontSize:36,marginBottom:8}}>📭</div>
                <div style={{fontSize:13,color:'var(--t3)'}}>No sources found</div>
              </div>
            ):(
              <div>
                <div style={{fontSize:11,color:'var(--t3)',marginBottom:12,fontWeight:500}}>
                  {allSources.length} verified source document{allSources.length>1?'s':''} — click any to open
                </div>
                {allSources.map((src,i)=>{
                  const meta=srcMeta(src.source_url)
                  return (
                    <a key={i} href={src.source_url} target="_blank" rel="noopener noreferrer" className="source-card">
                      <div className="source-label" style={{color:meta.color}}>
                        <span style={{fontSize:16}}>{meta.icon}</span>
                        {meta.label}
                        <svg style={{marginLeft:'auto',flexShrink:0}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </div>
                      <div className="source-url-text">{src.source_url}</div>
                      {src.exact_snippet&&(
                        <div className="source-snippet" style={{borderLeftColor:meta.color}}>
                          {src.exact_snippet.slice(0,220)}{src.exact_snippet.length>220?'…':''}
                        </div>
                      )}
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
