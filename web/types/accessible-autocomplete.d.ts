// accessible-autocomplete ships no TypeScript types; its documented options
// as components/address-search.tsx uses them (README, "API documentation").
declare module "accessible-autocomplete" {
  type Options<T> = {
    element: HTMLElement;
    id: string;
    source: (query: string, populateResults: (results: T[]) => void) => void;
    defaultValue?: string;
    name?: string;
    inputClasses?: string;
    menuAttributes?: Record<string, string>;
    displayMenu?: "inline" | "overlay";
    autoselect?: boolean;
    confirmOnBlur?: boolean;
    templates?: {
      inputValue?: (result: T | undefined) => string;
      suggestion?: (result: T) => string;
    };
    onConfirm?: (result: T | undefined) => void;
    tNoResults?: () => string;
    tStatusNoResults?: () => string;
    tStatusSelectedOption?: (
      option: string,
      length: number,
      index: number,
    ) => string;
    tStatusResults?: (length: number, selectedOption: string) => string;
    tAssistiveHint?: () => string;
  };
  export default function accessibleAutocomplete<T>(options: Options<T>): void;
}
