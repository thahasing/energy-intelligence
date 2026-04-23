'use client'
import React from 'react'
import { MapPin } from 'lucide-react'

interface ProjectMapProps {
  latitude: number
  longitude: number
  projectName: string
  projectType?: string | null
}

// Dynamic import of Leaflet to avoid SSR issues
export default function ProjectMap({ latitude, longitude, projectName, projectType }: ProjectMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!mounted || !mapRef.current) return

    let map: any = null

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default
        await import('leaflet/dist/leaflet.css')

        // Clean up if map already exists
        if (mapRef.current && (mapRef.current as any)._leaflet_id) {
          return
        }

        map = L.map(mapRef.current!, {
          center: [latitude, longitude],
          zoom: 8,
          zoomControl: true,
          attributionControl: false,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          opacity: 0.8,
        }).addTo(map)

        // Custom marker
        const typeColors: Record<string, string> = {
          solar: '#f59e0b',
          wind: '#06b6d4',
          battery: '#8b5cf6',
          hydro: '#06b6d4',
          geothermal: '#f59e0b',
          hybrid: '#22c55e',
        }
        const color = typeColors[projectType || ''] || '#22c55e'

        const icon = L.divIcon({
          html: `
            <div style="
              width: 36px; height: 36px;
              background: ${color}22;
              border: 2px solid ${color};
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 0 20px ${color}44;
            ">
              <div style="width: 10px; height: 10px; background: ${color}; border-radius: 50%;"></div>
            </div>
          `,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })

        L.marker([latitude, longitude], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #e2e8e4;">
              <strong style="color: ${color}; font-family: Inter, sans-serif;">${projectName}</strong><br/>
              <span style="color: #9ca3af; font-size: 11px;">${latitude.toFixed(4)}, ${longitude.toFixed(4)}</span>
            </div>
          `)
          .openPopup()

        // Pulse ring
        const pulseIcon = L.divIcon({
          html: `
            <div style="
              width: 80px; height: 80px;
              background: transparent;
              border: 1px solid ${color}33;
              border-radius: 50%;
              animation: pulse 2s infinite;
              margin-left: -22px; margin-top: -22px;
            "></div>
          `,
          className: '',
          iconSize: [80, 80],
        })
        L.marker([latitude, longitude], { icon: pulseIcon, zIndexOffset: -1 }).addTo(map)

      } catch (e) {
        console.error('Map init failed', e)
      }
    }

    initMap()

    return () => {
      if (map) {
        try { map.remove() } catch {}
      }
    }
  }, [mounted, latitude, longitude, projectName, projectType])

  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-1 rounded-xl">
        <MapPin className="w-6 h-6 text-white/20 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="relative h-full rounded-xl overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      {/* Coordinate overlay */}
      <div className="absolute bottom-3 left-3 glass-sm px-2 py-1 text-xs font-mono text-white/50 pointer-events-none">
        {latitude.toFixed(4)}, {longitude.toFixed(4)}
      </div>
    </div>
  )
}
