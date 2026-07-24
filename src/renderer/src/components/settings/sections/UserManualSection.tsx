export function UserManualSection(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 text-xs text-text-secondary">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">User Manual</h3>
        <p>A quick walkthrough of the day-to-day workflow.</p>
      </div>

      <Section title="1. Create a project and upload an SLD">
        Click "New Project" in the top bar, then "Upload PDF" to add a Single Line Diagram. Each
        project can hold multiple SLDs, listed in the left column.
      </Section>

      <Section title="2. Run AI extraction">
        Open an uploaded SLD and click "Re-run" (or generate the first extraction) to have Claude
        read the drawing and extract a bill of materials. Progress shows live in the top bar.
        Extraction respects the component types enabled in Settings → Components.
      </Section>

      <Section title="3. Generate and review the quotation">
        Once extraction finishes, switch to the "Quotation (Excel)" tab and generate a priced
        quotation. Each line is matched against your catalog automatically; unmatched lines are
        highlighted and can be resolved by double-clicking them.
      </Section>

      <Section title="4. Resolve flags">
        The Flags panel collects anything that needs human attention — unmatched catalog items,
        AI-raised warnings (e.g. an ambiguous rating), or notes you add yourself. Resolve a flag
        once you've addressed it.
      </Section>

      <Section title="5. Adjust pricing">
        Settings → Margins sets the default markup applied to new quotations. Any individual
        line's margin can also be edited inline in the Quotation table — useful for one-off
        discounts or premium items.
      </Section>

      <Section title="6. Approve and export">
        Once a quotation looks right, Approve it (with an optional comment), then use "Export
        quotation" for a single .xlsx, or "Export project" in the top bar to bundle every SLD and
        quotation for the project into one .zip with a manifest.
      </Section>

      <Section title="7. Catalog and account">
        Settings → Catalog Path points at the folder holding your pricing spreadsheet; Preferred
        Brands and Components tune what the AI looks for. Settings → Account holds your login,
        password recovery question, and log-out.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-text-primary">{title}</h4>
      <p>{children}</p>
    </div>
  )
}
