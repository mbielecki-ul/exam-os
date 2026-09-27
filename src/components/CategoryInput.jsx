import { useId, useState } from 'react'

// Text input with suggestions from the exam's existing categories, so a
// question lands in "Networking" rather than a new "networking " or
// "Netwroking". Typing filters the list (case-insensitive substring); arrow
// keys + Enter or a click pick one; Escape closes it. On blur, a value that
// matches an existing category apart from case/spaces is snapped to that
// category's spelling. A genuinely new name is still allowed, with a hint.
//
// `categories`: [{ name, count }] as built in AdminQuestionEditor.
export default function CategoryInput({ value, onChange, categories }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const query = value.trim().toLowerCase()
  const matches = categories.filter((c) => c.name.toLowerCase().includes(query))
  const existing = findCategory(value, categories)
  const showList = open && matches.length > 0

  function pick(name) {
    onChange(name)
    setOpen(false)
    setActive(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && showList && active >= 0) {
      e.preventDefault()
      pick(matches[active].name)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="category-combobox">
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={categories.length ? 'Start typing or pick a category' : 'e.g. Networking'}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          if (existing && existing.name !== value) onChange(existing.name)
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul className="category-options" id={listId} role="listbox">
          {matches.map((c, i) => (
            <li
              key={c.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={'category-option' + (i === active ? ' category-option-active' : '')}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c.name)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{c.name}</span>
              <span className="muted">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="category-hint">
        {!value.trim()
          ? 'Leave empty for "Uncategorized".'
          : existing
            ? `Existing category (${existing.count} question${existing.count === 1 ? '' : 's'}).`
            : `New category "${value.trim()}" will be created.`}
      </span>
    </div>
  )
}

// The existing category equal to `value` ignoring case and surrounding
// spaces, or undefined.
function findCategory(value, categories) {
  const wanted = value.trim().toLowerCase()
  return wanted ? categories.find((c) => c.name.toLowerCase() === wanted) : undefined
}
