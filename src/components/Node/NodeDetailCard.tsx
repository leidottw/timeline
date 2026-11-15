import type { Storyline, TimelineNode } from "../../types";
import { formatHistoricalDate } from "../../lib/date/historicalDate";
import { LinkPreview } from "../LinkPreview/LinkPreview";
import { useTimelineStore } from "../../store/useTimelineStore";

function formatNodeTime(node: TimelineNode): string {
  if (node.timeRange) {
    return `${formatHistoricalDate(node.timeRange.start)} — ${formatHistoricalDate(node.timeRange.end)}`;
  }
  if (node.time) {
    return formatHistoricalDate(node.time);
  }
  return "";
}

export function NodeDetailCard({
  node,
  storyline,
  onClose,
}: {
  node: TimelineNode;
  storyline: Storyline;
  onClose?: () => void;
}) {
  const setFocusedNodeId = useTimelineStore((s) => s.setFocusedNodeId);
  const toggleTag = useTimelineStore((s) => s.toggleTag);

  return (
    <div className="node-detail-card w-72 max-w-full rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug text-neutral-900">
          {node.title}
        </span>
        <button
          onClick={() => (onClose ? onClose() : setFocusedNodeId(null))}
          aria-label="關閉"
          className="shrink-0 text-neutral-400 hover:text-neutral-700"
        >
          <i className="ti ti-x text-sm" aria-hidden="true" />
        </button>
      </div>

      <p className="mb-2 text-xs text-neutral-500">
        {formatNodeTime(node)} · {storyline.name}
      </p>

      {node.description && (
        <p className="mb-3 text-xs leading-relaxed text-neutral-800">
          {node.description}
        </p>
      )}

      {node.images && node.images.length > 0 && (
        <div className="mb-2.5 flex gap-1.5 overflow-x-auto">
          {node.images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="h-16 w-24 shrink-0 rounded-md object-cover"
            />
          ))}
        </div>
      )}

      {node.tags && node.tags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {node.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800 hover:bg-blue-100"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {node.links && node.links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {node.links.map((link, i) => (
            <LinkPreview key={i} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}
