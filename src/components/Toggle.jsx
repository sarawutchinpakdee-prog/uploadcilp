export default function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/60 ${
        checked ? 'bg-lime-300 shadow-[0_0_16px_-2px_rgba(190,242,100,.6)]' : 'bg-white/15'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
          checked ? 'translate-x-5 bg-black' : 'bg-white'
        }`}
      />
    </button>
  );
}
