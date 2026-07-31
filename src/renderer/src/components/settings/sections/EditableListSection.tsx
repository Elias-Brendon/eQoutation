import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'

interface EditableListSectionProps {
  title: string
  description: string
  items: string[]
  placeholder: string
  onChange: (next: string[]) => void
}

export function EditableListSection({
  title,
  description,
  items,
  placeholder,
  onChange
}: EditableListSectionProps): React.JSX.Element {
  const [newItem, setNewItem] = useState('')

  const removeItem = (item: string): void => {
    onChange(items.filter((i) => i !== item))
  }

  const handleAdd = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = newItem.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed])
    setNewItem('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <div key={item} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-text-secondary">{item}</span>
              <button
                onClick={() => removeItem(item)}
                className="text-text-muted hover:text-danger"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="max-w-64"
        />
        <Button type="submit" variant="outline" size="sm">
          Add
        </Button>
      </form>
    </div>
  )
}
