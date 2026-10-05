import { type FormEvent, useId, useState } from 'react'
import { parseHex } from './color'

interface Props {
  /** colour to start from; without it the text field starts empty */
  initialHex?: string
  submitLabel: string
  onSubmit: (hex: string) => void
}

/**
 * System colour picker plus hex field. Dragging in the picker only changes
 * local state; the parent hears about a colour when the form is submitted.
 */
export function FreeColorControl({ initialHex, submitLabel, onSubmit }: Props) {
  const [picker, setPicker] = useState(initialHex ?? '#808080')
  const [text, setText] = useState(initialHex ?? '')
  const [invalid, setInvalid] = useState(false)
  const textId = useId()
  const errorId = useId()

  function changeText(value: string) {
    setText(value)
    setInvalid(false)
    const hex = parseHex(value)
    if (hex) setPicker(hex)
  }

  function changePicker(value: string) {
    setPicker(value)
    setText(value)
    setInvalid(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const hex = parseHex(text)
    if (!hex) {
      setInvalid(true)
      return
    }
    onSubmit(hex)
  }

  return (
    <form className="free-color" onSubmit={submit} noValidate>
      <label className="color-well">
        <span className="visually-hidden">Eigene Farbe wählen</span>
        <input type="color" value={picker} onChange={(event) => changePicker(event.target.value)} />
      </label>
      <label className="visually-hidden" htmlFor={textId}>
        Hex-Wert
      </label>
      <input
        id={textId}
        className="text-input"
        type="text"
        placeholder="#A1B2C3"
        value={text}
        onChange={(event) => changeText(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
      />
      <button type="submit" className="button">
        {submitLabel}
      </button>
      {invalid && (
        <p id={errorId} className="error" role="alert">
          Bitte einen Hex-Wert wie #A1B2C3 eingeben.
        </p>
      )}
    </form>
  )
}
