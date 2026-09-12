import { useState, useEffect, useRef } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumber,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

// Country data type
type Country = {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
};

// Build sorted country list
function buildCountries(): Country[] {
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  return getCountries()
    .map((code) => {
      try {
        const dialCode = "+" + getCountryCallingCode(code);
        const name = regionNames.of(code) ?? code;
        // Flag emoji from country code (each letter maps to a regional indicator symbol)
        const flag = code
          .split("")
          .map((c) => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1f1e6))
          .join("");
        return { code, name, dialCode, flag };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a!.name.localeCompare(b!.name)) as Country[];
}

const ALL_COUNTRIES = buildCountries();

// Detect user's country from browser locale/timezone
function detectCountry(): CountryCode {
  try {
    // Try timezone-based detection
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith("Africa/Lagos") || tz.startsWith("Africa/Abuja")) return "NG";
    // Map common timezones to countries
    const tzMap: Record<string, CountryCode> = {
      "Africa/Lagos": "NG",
      "Africa/Abuja": "NG",
      "America/New_York": "US",
      "America/Chicago": "US",
      "America/Los_Angeles": "US",
      "Europe/London": "GB",
      "Europe/Paris": "FR",
      "Europe/Berlin": "DE",
      "Asia/Dubai": "AE",
      "Asia/Kolkata": "IN",
      "Asia/Accra": "GH",
      "Africa/Nairobi": "KE",
      "Africa/Johannesburg": "ZA",
    };
    const detected = tzMap[tz];
    if (detected) return detected;
    // Try locale
    const locale = navigator.language || "";
    const regionFromLocale = locale.split("-")[1]?.toUpperCase() as CountryCode;
    if (regionFromLocale && ALL_COUNTRIES.some((c) => c.code === regionFromLocale)) {
      return regionFromLocale;
    }
  } catch { /* ignore */ }
  return "NG"; // Default to Nigeria
}

type PhoneInputProps = {
  value: string; // E.164 format e.g. "+2348012345678"
  onChange: (value: string, isValid: boolean) => void;
  label?: string;
  error?: string | null;
  hint?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

export function PhoneInput({
  value,
  onChange,
  label,
  error,
  hint,
  placeholder,
  autoFocus,
  className = "",
}: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(() => {
    // Try to parse existing value to get country
    if (value) {
      try {
        const parsed = parsePhoneNumber(value);
        if (parsed?.country) return parsed.country;
      } catch { /* ignore */ }
    }
    return detectCountry();
  });
  const [localNumber, setLocalNumber] = useState(() => {
    // Strip dial code to show national number
    if (value) {
      try {
        const parsed = parsePhoneNumber(value);
        if (parsed) return parsed.formatNational();
      } catch { /* ignore */ }
    }
    return "";
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const country = ALL_COUNTRIES.find((c) => c.code === selectedCountry)!;
  const filtered = ALL_COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus search when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [dropdownOpen]);

  function handleNumberChange(raw: string) {
    // Strip anything that's not digits, spaces, dashes, parens
    const cleaned = raw.replace(/[^\d\s\-()]/g, "");
    setLocalNumber(cleaned);

    // Build E.164 for parent
    const dialCode = getCountryCallingCode(selectedCountry);
    const digits = cleaned.replace(/\D/g, "");
    if (!digits) {
      onChange("", false);
      return;
    }
    const e164 = "+" + dialCode + digits;
    const valid = isValidPhoneNumber(e164, selectedCountry);
    onChange(e164, valid);
  }

  function handleCountrySelect(code: CountryCode) {
    setSelectedCountry(code);
    setDropdownOpen(false);
    setSearch("");

    // Re-emit with new country code
    const dialCode = getCountryCallingCode(code);
    const digits = localNumber.replace(/\D/g, "");
    if (digits) {
      const e164 = "+" + dialCode + digits;
      const valid = isValidPhoneNumber(e164, code);
      onChange(e164, valid);
    } else {
      onChange("", false);
    }
  }

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          {label}
        </label>
      )}

      {/* Input wrapper — double border: outer ring + inner border */}
      <div
        className={[
          "relative flex h-12 items-center rounded-xl transition-all duration-150",
          error
            ? "border border-red-400"
            : "border border-gray-200",
        ].join(" ")}
      >
        {/* Country selector button */}
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex h-full items-center gap-1.5 rounded-l-xl border-r border-gray-200 bg-gray-50 px-3 transition hover:bg-gray-100 focus:outline-none"
          aria-label="Select country"
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          <span className="text-lg leading-none">{country?.flag ?? "🌍"}</span>
          <span className="text-sm font-medium text-gray-600">
            {country?.dialCode ?? "+234"}
          </span>
          <svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>

        {/* Phone number input */}
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          value={localNumber}
          onChange={(e) => handleNumberChange(e.target.value)}
          placeholder={placeholder ?? "800 123 4567"}
          className="h-full flex-1 bg-transparent px-3 text-base text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>

      {/* Dropdown */}
      {dropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          role="listbox"
          aria-label="Country selector"
        >
          {/* Search */}
          <div className="border-b border-gray-100 p-2">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
              <svg
                viewBox="0 0 16 16"
                width="13"
                height="13"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="6.5" cy="6.5" r="4" />
                <path d="M11 11l3 3" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Country list */}
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-xs text-gray-400">No countries found</li>
            )}
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => handleCountrySelect(c.code)}
                  className={[
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-blue-50",
                    c.code === selectedCountry ? "bg-blue-50" : "",
                  ].join(" ")}
                  role="option"
                  aria-selected={c.code === selectedCountry}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="flex-1 truncate text-sm text-gray-900">{c.name}</span>
                  <span className="shrink-0 text-xs font-medium text-gray-400">
                    {c.dialCode}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

export { detectCountry };
