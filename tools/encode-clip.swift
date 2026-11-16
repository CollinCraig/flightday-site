// Video helper for the site's feature clips. AVFoundation only, no ffmpeg needed.
//
//   encode  <frames-dir> <out.mp4> <fps> <kbps>
//       Every *.jpg in the folder, in name order, at a constant frame rate → H.264 High, muted, moov first (fast start).
//   extract <in.mov|mp4> <out-dir> <fps> <start-s> <dur-s> <canvas-w> <canvas-h> <fit-h>
//       Frames from a simulator recording, scaled to <fit-h> pixels tall and centred on a Night (#0A0E1A) canvas,
//       written as numbered JPEGs for `encode`. Rounded corners match a phone screen.
//
// Build: DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc -O tools/encode-clip.swift -o <dir>/encode-clip
import AVFoundation
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }
let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: encode-clip encode|extract …") }

func loadImage(_ url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func encode(dir: String, out: String, fps: Int32, kbps: Int) {
    let files = (try? FileManager.default.contentsOfDirectory(atPath: dir))?.filter { $0.hasSuffix(".jpg") }.sorted() ?? []
    guard let first = files.first, let img0 = loadImage(URL(fileURLWithPath: dir).appendingPathComponent(first)) else { fail("no frames in \(dir)") }
    let w = img0.width, h = img0.height
    let outURL = URL(fileURLWithPath: out)
    try? FileManager.default.removeItem(at: outURL)
    guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { fail("cannot write \(out)") }
    writer.shouldOptimizeForNetworkUse = true
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: kbps * 1000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2, AVVideoExpectedSourceFrameRateKey: Int(fps),
            AVVideoAllowFrameReorderingKey: true, AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
        ],
        AVVideoColorPropertiesKey: [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2, AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h,
    ])
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    for (i, name) in files.enumerated() {
        autoreleasepool {
            guard let img = i == 0 ? img0 : loadImage(URL(fileURLWithPath: dir).appendingPathComponent(name)) else { fail("bad frame \(name)") }
            while !input.isReadyForMoreMediaData { usleep(2000) }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
            guard let buf = pb else { fail("no pixel buffer") }
            CVPixelBufferLockBaseAddress(buf, [])
            let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                                space: space, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
            CVPixelBufferUnlockBaseAddress(buf, [])
            adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
        }
    }
    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    if writer.status != .completed { fail("encode failed: \(writer.error?.localizedDescription ?? "?")") }
    print("encoded \(files.count) frames \(w)x\(h) → \(out)")
}

func extract(input: String, outDir: String, fps: Double, start: Double, dur: Double, cw: Int, ch: Int, fitH: Int) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: input))
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 120)
    gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 120)
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let n = Int((dur * fps).rounded())
    var last: CGImage?
    for i in 0..<n {
        autoreleasepool {
            let t = CMTime(seconds: start + Double(i) / fps, preferredTimescale: 600)
            let frame = (try? gen.copyCGImage(at: t, actualTime: nil)) ?? last
            guard let img = frame else { fail("no frame at \(t.seconds)") }
            last = img
            let ctx = CGContext(data: nil, width: cw, height: ch, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
            ctx.setFillColor(CGColor(srgbRed: 10 / 255, green: 14 / 255, blue: 26 / 255, alpha: 1))
            ctx.fill(CGRect(x: 0, y: 0, width: cw, height: ch))
            let scale = Double(fitH) / Double(img.height)
            let dw = Double(img.width) * scale, dh = Double(fitH)
            let rect = CGRect(x: (Double(cw) - dw) / 2, y: (Double(ch) - dh) / 2, width: dw, height: dh)
            ctx.interpolationQuality = .high
            ctx.saveGState()
            ctx.addPath(CGPath(roundedRect: rect, cornerWidth: dw * 0.12, cornerHeight: dw * 0.12, transform: nil))
            ctx.clip()
            ctx.draw(img, in: rect)
            ctx.restoreGState()
            ctx.setStrokeColor(CGColor(srgbRed: 38 / 255, green: 46 / 255, blue: 69 / 255, alpha: 1))
            ctx.setLineWidth(3)
            ctx.addPath(CGPath(roundedRect: rect.insetBy(dx: -1.5, dy: -1.5), cornerWidth: dw * 0.12 + 1.5, cornerHeight: dw * 0.12 + 1.5, transform: nil))
            ctx.strokePath()
            let url = URL(fileURLWithPath: outDir).appendingPathComponent(String(format: "%05d.jpg", i))
            let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
            CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
            CGImageDestinationFinalize(dest)
        }
    }
    print("extracted \(n) frames → \(outDir)")
}

switch args[1] {
case "encode" where args.count == 6:
    encode(dir: args[2], out: args[3], fps: Int32(args[4])!, kbps: Int(args[5])!)
case "extract" where args.count == 10:
    extract(input: args[2], outDir: args[3], fps: Double(args[4])!, start: Double(args[5])!, dur: Double(args[6])!,
            cw: Int(args[7])!, ch: Int(args[8])!, fitH: Int(args[9])!)
default:
    fail("usage: encode-clip encode <dir> <out.mp4> <fps> <kbps> | extract <in> <out-dir> <fps> <start> <dur> <cw> <ch> <fit-h>")
}
