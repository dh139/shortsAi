"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, Play, Clock, TrendingUp, Loader2 } from "lucide-react"

export default function YTShorts() {
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [clips, setClips] = useState([])
  const [error, setError] = useState("")

  // Simulated viral clips data
  const generateClips = async () => {
    if (!youtubeUrl) {
      setError("Please enter a YouTube URL")
      return
    }

    if (!youtubeUrl.includes("youtube.com") && !youtubeUrl.includes("youtu.be")) {
      setError("Please enter a valid YouTube URL")
      return
    }

    setIsGenerating(true)
    setError("")

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Generate mock viral clips
    const mockClips = [
      {
        id: 1,
        title: "Epic Moment #1",
        duration: "0:15",
        viralScore: 95,
        thumbnail: "/placeholder.svg?height=180&width=320",
        startTime: "2:34",
        endTime: "2:49",
        description: "Most viral moment from the video",
      },
      {
        id: 2,
        title: "Trending Clip #2",
        duration: "0:12",
        viralScore: 88,
        thumbnail: "/placeholder.svg?height=180&width=320",
        startTime: "5:21",
        endTime: "5:33",
        description: "High engagement potential",
      },
      {
        id: 3,
        title: "Viral Hook #3",
        duration: "0:18",
        viralScore: 92,
        thumbnail: "/placeholder.svg?height=180&width=320",
        startTime: "8:45",
        endTime: "9:03",
        description: "Perfect for social media",
      },
      {
        id: 4,
        title: "Catchy Segment #4",
        duration: "0:14",
        viralScore: 85,
        thumbnail: "/placeholder.svg?height=180&width=320",
        startTime: "12:10",
        endTime: "12:24",
        description: "Great for TikTok/Instagram",
      },
    ]

    setClips(mockClips)
    setIsGenerating(false)
  }

  const downloadClip = async (clip) => {
    // Simulate download process
    const link = document.createElement("a")
    link.href = "#"
    link.download = `ytshorts_${clip.title.replace(/\s+/g, "_").toLowerCase()}.mp4`

    // In a real implementation, this would trigger the actual download
    alert(`Downloading: ${clip.title}`)
  }

  const getViralScoreColor = (score) => {
    if (score >= 90) return "bg-green-500"
    if (score >= 80) return "bg-yellow-500"
    return "bg-orange-500"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            YT<span className="text-red-500">Shorts</span>
          </h1>
          <p className="text-gray-600 text-lg">Generate viral short clips from YouTube videos instantly</p>
        </div>

        {/* Input Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-500" />
              Generate Viral Clips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                type="url"
                placeholder="Paste YouTube video URL here..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="flex-1"
              />
              <Button onClick={generateClips} disabled={isGenerating} className="bg-red-500 hover:bg-red-600">
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Shorts"
                )}
              </Button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </CardContent>
        </Card>

        {/* Loading State */}
        {isGenerating && (
          <Card className="mb-8">
            <CardContent className="py-12">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-red-500" />
                <h3 className="text-xl font-semibold mb-2">Analyzing Video Content</h3>
                <p className="text-gray-600">AI is identifying the most viral moments from your video...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Clips */}
        {clips.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Play className="w-6 h-6 text-red-500" />
              Generated Viral Clips ({clips.length})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {clips.map((clip) => (
                <Card key={clip.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="relative">
                    <img
                      src={clip.thumbnail || "/placeholder.svg"}
                      alt={clip.title}
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <Badge className={`${getViralScoreColor(clip.viralScore)} text-white`}>
                        {clip.viralScore}% Viral
                      </Badge>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="secondary" className="bg-black/70 text-white">
                        <Clock className="w-3 h-3 mr-1" />
                        {clip.duration}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-2">{clip.title}</h3>
                    <p className="text-gray-600 text-sm mb-3">{clip.description}</p>

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <span>
                        From {clip.startTime} to {clip.endTime}
                      </span>
                    </div>

                    <Button onClick={() => downloadClip(clip)} className="w-full bg-green-500 hover:bg-green-600">
                      <Download className="w-4 h-4 mr-2" />
                      Download Clip
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Features Section */}
        {clips.length === 0 && !isGenerating && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <Card>
              <CardContent className="p-6 text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-red-500" />
                <h3 className="font-semibold text-lg mb-2">AI-Powered Analysis</h3>
                <p className="text-gray-600">Our AI identifies the most engaging moments that have viral potential</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Download className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h3 className="font-semibold text-lg mb-2">Instant Downloads</h3>
                <p className="text-gray-600">Download your clips immediately in high quality MP4 format</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Play className="w-12 h-12 mx-auto mb-4 text-blue-500" />
                <h3 className="font-semibold text-lg mb-2">Ready for Social</h3>
                <p className="text-gray-600">
                  Perfect length and format for TikTok, Instagram Reels, and YouTube Shorts
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
