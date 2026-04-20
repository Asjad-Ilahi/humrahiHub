import Image from "next/image";
import Link from "next/link";
import { Globe, Mail, MapPin, MessageCircle, Phone, Send, Share2 } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-8 py-16 md:grid-cols-[1.85fr_1fr_1fr_1.1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="HumRahi hub logo" width={40} height={40} />
            <span className="text-[29px] font-bold leading-none text-secondary">HUMRAHI HUB</span>
          </div>
          <p className="mt-8 max-w-[560px] text-[19px] leading-[1.45] text-text-secondary">
            A social impact platform that turns local problems into actionable solutions by connecting people who
            report issues with those who want to fund and fix them
          </p>
          <div className="mt-8 flex items-center gap-5 text-secondary">
            <Globe size={18} />
            <Send size={18} />
            <Share2 size={18} />
            <MessageCircle size={18} />
          </div>
        </div>

        <div>
          <h4 className="text-[30px] font-bold text-secondary">Navigation</h4>
          <div className="mt-7 space-y-3.5 text-[21px] text-text-secondary">
            <Link href="/">What we Do</Link>
            <div>How it Works</div>
            <div>Our Trust</div>
            <div>Join Us</div>
            <div>Contact</div>
          </div>
        </div>

        <div>
          <h4 className="text-[30px] font-bold text-secondary">Licence</h4>
          <div className="mt-7 space-y-3.5 text-[21px] text-text-secondary">
            <div>Privacy Policy</div>
            <div>Copyright</div>
            <div>Terms and Conditions</div>
          </div>
        </div>

        <div>
          <h4 className="text-[30px] font-bold text-secondary">Contact</h4>
          <div className="mt-7 space-y-3.5 text-[21px] text-text-secondary">
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-secondary" />
              <span>+92 326 0362844</span>
            </div>
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-secondary" />
              <span>asjadilahi01@gmail.com</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-secondary" />
              <span>Virtual World, I69 Markaz</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
