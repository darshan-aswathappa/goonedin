declare module "react-simple-maps" {
  import { ComponentType, CSSProperties, ReactNode } from "react";

  interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
    rotate?: [number, number, number];
  }

  export const ComposableMap: ComponentType<{
    projection?: string;
    projectionConfig?: ProjectionConfig;
    style?: CSSProperties;
    width?: number;
    height?: number;
    children?: ReactNode;
  }>;

  export const Geographies: ComponentType<{
    geography: string | Record<string, unknown>;
    children: (data: { geographies: any[] }) => ReactNode;
  }>;

  export const Geography: ComponentType<{
    geography: any;
    key?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
  }>;

  export const Marker: ComponentType<{
    coordinates: [number, number];
    key?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    children?: ReactNode;
  }>;

  export const Line: ComponentType<{
    from: [number, number];
    to: [number, number];
    stroke?: string;
    strokeWidth?: number;
    strokeLinecap?: string;
  }>;

  export const Graticule: ComponentType<{
    stroke?: string;
    strokeWidth?: number;
  }>;

  export const ZoomableGroup: ComponentType<{
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    onMoveEnd?: (position: { coordinates: [number, number]; zoom: number }) => void;
    onMoveStart?: (position: { coordinates: [number, number]; zoom: number }) => void;
    onMove?: (position: { coordinates: [number, number]; zoom: number }) => void;
    children?: ReactNode;
  }>;
}
