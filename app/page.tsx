import { Faq, Hero, SiteFooter, SiteNav, Steps, Why } from "./site";
import SubtitleTool from "./subtitle-tool";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Why />
        <Steps />
        <SubtitleTool />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
