declare module 'react-native-svg' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

  export interface SvgProps extends ViewProps {
    width?: number | string;
    height?: number | string;
    viewBox?: string;
  }

  export default class Svg extends React.Component<SvgProps> {}

  export interface CircleProps {
    cx?: number | string;
    cy?: number | string;
    r?: number | string;
    stroke?: string;
    strokeWidth?: number | string;
    fill?: string;
    strokeDasharray?: string | ReadonlyArray<number>;
    strokeDashoffset?: any;
    strokeLinecap?: 'butt' | 'square' | 'round';
    rotation?: number;
    originX?: number | string;
    originY?: number | string;
  }

  export class Circle extends React.Component<CircleProps> {}
}


