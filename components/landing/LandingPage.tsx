'use client'

import React, { useEffect } from 'react'
import Nav from './Nav'
import Hero from './Hero'
import ValuePropSection from './ValuePropSection'
import FeatureGrid from './FeatureGrid'
import AgentSection from './AgentSection'
import InsightsSection from './InsightsSection'
import VoiceExperienceSection from './VoiceExperienceSection'
import TestimonialSection from './TestimonialSection'
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
      <ValuePropSection />
      <FeatureGrid />
      <AgentSection />
      <InsightsSection />
      <VoiceExperienceSection />
      <TestimonialSection />
      <CTASection />
      <Footer />
    </div>
  )
}
