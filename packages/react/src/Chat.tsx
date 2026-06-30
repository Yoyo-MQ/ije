'use client';

export interface ChatProps {
  title?: string;
  placeholder?: string;
  width?: string;
  height?: string;
}

export function Chat({ title, placeholder, width, height }: ChatProps) {
  return (
    <ije-chat
      title={title}
      placeholder={placeholder}
      width={width}
      height={height}
    />
  );
}
