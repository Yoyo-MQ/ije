'use client';

export interface IjeChatProps {
  title?: string;
  placeholder?: string;
  width?: string;
  height?: string;
}

export function IjeChat({ title, placeholder, width, height }: IjeChatProps) {
  return (
    <ije-chat
      title={title}
      placeholder={placeholder}
      width={width}
      height={height}
    />
  );
}
