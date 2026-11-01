// Global React/JSX namespaces for the offline type-check.
declare global {
  namespace React {
    type ReactNode = any;
    type ReactElement = any;
    type ComponentProps<T = any> = { [key: string]: any; children?: any; className?: string };
    type ComponentType<P = any> = (props: P) => any;
    type FormEvent<T = any> = any;
    type ChangeEvent<T = any> = any;
  }
  namespace JSX {
    type Element = any;
    interface ElementClass { render: any }
    interface ElementAttributesProperty { props: {} }
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { key?: any }
    interface IntrinsicElements { [name: string]: any }
  }
}
export {};
