import Image from "next/image";
import mark from "../public/WetScan_logo.svg";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <Image src={mark} width={34} height={34} alt="" />
      {!compact && (
        <span>
          WetScan<span className="logo-period">.</span>
        </span>
      )}
    </span>
  );
}
