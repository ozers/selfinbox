import { CheckCircle, XCircle, Copy } from "lucide-react"
import { useCopy } from "@/lib/use-copy"
import type { DnsRecord } from "@/lib/types"

// MX values arrive as "10 inbound-smtp…"; split so the priority renders as
// its own chip and only the host is copied.
function splitRecord(record: DnsRecord) {
  const isMx = record.type === "MX"
  const [mxPriority, mxHost] = isMx ? record.value.split(" ") : ["", ""]
  return { isMx, mxPriority, valueText: isMx ? mxHost : record.value }
}

function CopyIconButton({
  onCopy,
  label,
  revealOnHover,
}: {
  onCopy: () => void
  label: string
  revealOnHover?: boolean
}) {
  return (
    <button
      onClick={onCopy}
      className={`shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground ${
        revealOnHover
          ? "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          : ""
      }`}
      aria-label={label}
    >
      <Copy className="h-3 w-3" />
    </button>
  )
}

function VerifiedIcon({ verified }: { verified: boolean }) {
  return verified ? (
    <CheckCircle className="h-4 w-4 text-status-active" />
  ) : (
    <XCircle className="h-4 w-4 text-muted-foreground/40" />
  )
}

// The domain-detail DNS table: a fixed-layout <table> on desktop and
// stacked rows on mobile, each cell with a copy-to-clipboard affordance.
export function DnsRecordList({ records }: { records: DnsRecord[] }) {
  const { copy } = useCopy()

  return (
    <>
      {/* Desktop: fixed-layout table, columns truncate with ellipsis */}
      <table className="hidden w-full table-fixed sm:table">
        <colgroup>
          <col className="w-[72px]" />
          <col />
          <col />
          <col className="w-12" />
        </colgroup>
        <tbody className="divide-y divide-border">
          {records.map((record, i) => {
            const { isMx, mxPriority, valueText } = splitRecord(record)
            return (
              <tr key={i} className="group">
                <td className="px-5 py-3.5 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {record.type}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={record.name}>
                      {record.name}
                    </span>
                    <CopyIconButton onCopy={() => copy(record.name)} label="Copy name" revealOnHover />
                  </div>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    {isMx && (
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {mxPriority}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary" title={valueText}>
                      {valueText}
                    </span>
                    <CopyIconButton onCopy={() => copy(valueText)} label="Copy value" revealOnHover />
                  </div>
                </td>
                <td className="px-5 py-3.5 align-middle">
                  <VerifiedIcon verified={record.verified} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Mobile: stacked rows */}
      <div className="divide-y divide-border sm:hidden">
        {records.map((record, i) => {
          const { isMx, mxPriority, valueText } = splitRecord(record)
          return (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {record.type}
                </span>
                <VerifiedIcon verified={record.verified} />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={record.name}>
                  {record.name}
                </span>
                <CopyIconButton onCopy={() => copy(record.name)} label="Copy name" />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {isMx && (
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {mxPriority}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary" title={valueText}>
                  {valueText}
                </span>
                <CopyIconButton onCopy={() => copy(valueText)} label="Copy value" />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
