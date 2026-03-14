'use client'

import React, { useEffect } from 'react'
import Nav from './Nav'
import Hero from './Hero'
import FeatureGrid from './FeatureGrid'
import AgentSection from './AgentSection'
import ProblemFlowSection from './ProblemFlowSection'
import CostSection from './CostSection'
import IntegrationsSection from './IntegrationsSection'
import CTASection from './CTASection'
import Footer from './Footer'

export default function LandingPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible') }) },
      { threshold: 0.1 }
    )
    document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ background: 'var(--giga-bg)', minHeight: '100vh' }}>
      <Nav />
      <Hero />
      <FeatureGrid />
      <AgentSection />
      <ProblemFlowSection />
      <CostSection />
      <IntegrationsSection />
      <CTASection />
      <Footer />
    </div>
  )
}
