import { Faq, Features, Hero, SiteFooter, SiteNav, Steps } from "./site";
import SubtitleTool from "./subtitle-tool";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Features />
        <Steps />
        <SubtitleTool />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
