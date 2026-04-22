export function LandingBtcDivider() {
  return (
    <section
      className="relative mt-20 overflow-hidden"
      style={{ height: 200 }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: "#2A1400" }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/landing/ascii-mountain.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          mixBlendMode: "screen",
          opacity: 0.7,
        }}
      />
      <div className="absolute inset-0 mx-auto flex max-w-[1200px] items-center px-8 max-md:px-5">
        <div className="font-mono text-[13px] uppercase" style={{ color: "#FF8A3C", letterSpacing: "0.12em" }}>
          <div className="mb-3 flex items-center gap-2.5">
            <span
              className="inline-block h-2 w-2"
              style={{ background: "#FF8A3C" }}
            />
            New · BTC call markets
          </div>
          <div
            className="font-space font-semibold text-content-primary normal-case"
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            Now with Bitcoin.
          </div>
        </div>
      </div>
    </section>
  );
}
