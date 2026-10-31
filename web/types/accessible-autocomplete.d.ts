// accessible-autocomplete ships no TypeScript types; its documented options
// as components/address-search.tsx uses them (README, "API documentation"),
// for its React build (README, "Using with React"): the same options as
// props, but for `element`, which React's own render replaces.
declare module "accessible-autocomplete/react" {
  import type { Component } from "react";

  type Props<T> = {
    id: string;
    source: (query: string, populateResults: (results: T[]) => void) => void;
    name?: string;
    inputClasses?: string;
    menuAttributes?: Record<string, string>;
    confirmOnBlur?: boolean;
    templates?: {
      inputValue?: (result: T | undefined) => string;
      suggestion?: (result: T) => string;
    };
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
  export default class Autocomplete<T> extends Component<Props<T>> {}
}
