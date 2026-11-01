"use client";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return <Sonner richColors closeButton position="top-right" toastOptions={{ duration: 4000 }} {...props} />;
}

export { Toaster };
