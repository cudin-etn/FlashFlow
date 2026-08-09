declare module "../../wailsjs/go/main/App" {
  export function Ping(): Promise<string>;
  export function ListADBDevices(): Promise<any>;
  export function ListFastbootDevices(): Promise<any>;
  export function FlashFactoryDemo(): Promise<void>;
}

declare module "../../wailsjs/runtime/runtime" {
  export function EventsOn(event: string, callback: (...args: any[]) => void): void;
}
