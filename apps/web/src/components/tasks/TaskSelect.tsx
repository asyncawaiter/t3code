import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";

export function TaskSelect({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  options: { value: string; label: string; detail?: string | undefined; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={ariaLabel} className="w-full min-w-0 font-normal">
          <SelectValue>
            {options.find((item) => item.value === value)?.label ?? "Unavailable"}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup
          alignItemWithTrigger={false}
          className="max-h-64"
          popupClassName="max-w-[min(28rem,calc(100vw-2rem))]"
        >
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              <span className="block truncate">{item.label}</span>
              {item.detail && (
                <span className="block truncate text-[11px] font-normal text-muted-foreground">
                  {item.detail}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </label>
  );
}
