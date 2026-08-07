import { ERROR_CODES } from '@shared/errors/errorCodes'

const DOMAIN_LABELS: Record<string, string> = {
  AUTH: 'Account & login',
  AI: 'AI extraction',
  DB: 'Records not found',
  CAT: 'Catalog file',
  QT: 'Quotations',
  SEC: 'API keys',
  FX: 'Currency exchange',
  GEN: 'General'
}

export function UserManualSection(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 text-xs text-text-secondary">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">User Manual</h3>
        <p>A quick walkthrough of the day-to-day workflow.</p>
      </div>

      <Section title="1. Create a project and upload an SLD">
        Click &quot;New Project&quot; in the top bar, then &quot;Upload PDF&quot; to add a Single
        Line Diagram. Each project can hold multiple SLDs, listed in the left column.
      </Section>

      <Section title="2. Run AI extraction">
        Open an uploaded SLD and click &quot;Re-run&quot; (or generate the first extraction) to have
        Claude read the drawing and extract a bill of materials. Progress shows live in the top bar.
        Extraction respects the component types enabled in Settings → Components.
      </Section>

      <Section title="3. Generate and review the quotation">
        Once extraction finishes, switch to the &quot;Quotation (Excel)&quot; tab and generate a
        priced quotation. Each line is matched against your catalog automatically; unmatched lines
        are highlighted and can be resolved by double-clicking them.
      </Section>

      <Section title="4. Resolve flags">
        The Flags panel collects anything that needs human attention unmatched catalog items,
        AI-raised warnings (e.g. an ambiguous rating), or notes you add yourself. Resolve a flag
        once you&apos;ve addressed it.
      </Section>

      <Section title="5. Adjust pricing">
        Settings → Margins sets the default markup applied to new quotations. Any individual
        line&apos;s margin can also be edited inline in the Quotation table useful for one-off
        discounts or premium items.
      </Section>

      <Section title="6. Approve and export">
        Once a quotation looks right, Approve it (with an optional comment), then use &quot;Export
        quotation&quot; for a single .xlsx, or &quot;Export project&quot; in the top bar to bundle
        every SLD and quotation for the project into one .zip with a manifest.
      </Section>

      <Section title="7. Catalog and account">
        Settings → Catalog Path points at the folder holding your pricing spreadsheet; Preferred
        Brands and Components tune what the AI looks for. Settings → Account holds your login,
        password recovery question, and log-out.
      </Section>

      <ShortcutsSection />
      <ErrorCodesSection />
    </div>
  )
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl+U', action: 'Upload PDF' },
  { keys: 'Ctrl+Shift+N', action: 'New Project' },
  { keys: 'Ctrl+E', action: 'Export project' },
  { keys: 'Ctrl+1', action: 'Split view (PDF + Quotation)' },
  { keys: 'Ctrl+2', action: 'Expand PDF diagram' },
  { keys: 'Ctrl+3', action: 'Expand quotation' },
  { keys: '↑ / ↓', action: 'Move the highlight in the SLD list' },
  { keys: 'Enter', action: 'Open the highlighted SLD' },
  { keys: 'Esc', action: 'Close a pinned sidebar panel or dialog' }
]

function ShortcutsSection(): React.JSX.Element {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-text-primary">8. Keyboard shortcuts</h4>
      <p className="mb-2">
        Ignored while typing in a field or while a dialog is open, so they never hijack normal
        input.
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-b border-border last:border-0">
              <td className="w-32 shrink-0 py-1 pr-3 align-top font-mono text-text-muted">
                {s.keys}
              </td>
              <td className="py-1 align-top">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorCodesSection(): React.JSX.Element {
  const grouped = new Map<string, { code: string; message: string }[]>()
  for (const entry of Object.values(ERROR_CODES)) {
    const domain = entry.code.split('-')[0]
    const list = grouped.get(domain) ?? []
    list.push(entry)
    grouped.set(domain, list)
  }
  const domains = [...grouped.keys()].sort()

  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-text-primary">9. Error codes</h4>
      <p className="mb-2">
        Every error the app shows starts with a short code, e.g. &quot;Error AI-002: ...&quot; it
        doesn&apos;t expose any internal detail, just which known issue you hit. If something keeps
        happening, note the code below when asking for help.
      </p>
      <div className="flex flex-col gap-3">
        {domains.map((domain) => (
          <div key={domain}>
            <h5 className="mb-1 text-[11px] font-semibold text-text-secondary">
              {DOMAIN_LABELS[domain] ?? domain}
            </h5>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {(grouped.get(domain) ?? [])
                  .slice()
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((entry) => (
                    <tr key={entry.code} className="border-b border-border last:border-0">
                      <td className="w-20 shrink-0 py-1 pr-3 align-top font-mono text-text-muted">
                        {entry.code}
                      </td>
                      <td className="py-1 align-top">{entry.message}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-text-primary">{title}</h4>
      <p>{children}</p>
    </div>
  )
}
