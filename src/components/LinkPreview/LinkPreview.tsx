import { useEffect, useState } from 'react'
import type { NodeLink } from '../../types'

interface PreviewData {
  title: string
  thumbnail?: string
}

const cache = new Map<string, PreviewData | null>()

async function fetchPreview(link: NodeLink): Promise<PreviewData | null> {
  if (cache.has(link.url)) return cache.get(link.url) ?? null

  try {
    if (link.type === 'youtube') {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`
      )
      if (!res.ok) throw new Error('oEmbed failed')
      const json = await res.json()
      const data: PreviewData = { title: json.title, thumbnail: json.thumbnail_url }
      cache.set(link.url, data)
      return data
    }
    if (link.type === 'wiki') {
      const title = decodeURIComponent(link.url.split('/wiki/')[1] ?? '')
      const lang = link.url.includes('zh.wikipedia') ? 'zh' : 'en'
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      )
      if (!res.ok) throw new Error('wiki summary failed')
      const json = await res.json()
      const data: PreviewData = {
        title: json.title ?? title,
        thumbnail: json.thumbnail?.source,
      }
      cache.set(link.url, data)
      return data
    }
  } catch {
    cache.set(link.url, null)
    return null
  }
  return null
}

const typeIcon: Record<NodeLink['type'], string> = {
  youtube: 'ti-brand-youtube',
  wiki: 'ti-book',
  generic: 'ti-external-link',
}

export function LinkPreview({ link }: { link: NodeLink }) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(link.type !== 'generic')

  useEffect(() => {
    let cancelled = false
    if (link.type === 'generic') {
      setLoading(false)
      return
    }
    fetchPreview(link).then((data) => {
      if (!cancelled) {
        setPreview(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [link])

  const displayTitle = preview?.title ?? link.title ?? link.url

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md border border-black/10 px-2 py-1.5 text-xs hover:bg-black/[0.03] no-underline"
    >
      {preview?.thumbnail ? (
        <img
          src={preview.thumbnail}
          alt=""
          className="h-8 w-12 shrink-0 rounded object-cover"
        />
      ) : (
        <i className={`ti ${typeIcon[link.type]} shrink-0 text-sm text-black/50`} aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate text-blue-800">
        {loading ? '載入預覽中…' : displayTitle}
      </span>
      <i className="ti ti-external-link shrink-0 text-xs text-black/30" aria-hidden="true" />
    </a>
  )
}
