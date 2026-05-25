'use client';

import { useState } from 'react';
import Image from 'next/image';
import { InitialsAvatar } from '@/components/initials-avatar';
import { DARK_BLUR_DATA_URL } from '@/lib/blur-data-url';

interface CaskIconProps {
  token: string;
  name: string;
  iconUrl: string | null;
  size?: number;
}

export function CaskIcon({ token, name, iconUrl, size = 52 }: CaskIconProps) {
  const [failed, setFailed] = useState(false);

  if (!iconUrl || failed) {
    return <InitialsAvatar token={token} size={size} />;
  }

  return (
    <Image
      src={iconUrl}
      width={size}
      height={size}
      alt={name + ' icon'}
      className="rounded-[10px]"
      placeholder="blur"
      blurDataURL={DARK_BLUR_DATA_URL}
      onError={() => setFailed(true)}
    />
  );
}
