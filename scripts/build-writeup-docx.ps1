<#
.SYNOPSIS
  Generates WRITEUP.docx (a real Word document) from WRITEUP.md.

.DESCRIPTION
  The brief asks for the write-up as a short 1-2 page document. WRITEUP.md stays
  the source of truth; this script renders it to .docx so there is only ever one
  copy to keep up to date.

  A .docx is just a ZIP of OpenXML parts, so this builds one directly with .NET's
  built-in compression: no Word install, no pandoc, no PowerShell modules. That
  means it runs anywhere, including on a machine without Office.

  The output uses real Word styles (Title / Heading 1 / List Paragraph) rather
  than ad-hoc direct formatting, so headings show up in the navigation pane, the
  document is restyleable in Word, and bullets behave like native Word bullets.

  Supports the subset of Markdown WRITEUP.md actually uses: h1/h2, paragraphs,
  '-' bullets, pipe tables, **bold**, `code`, and [links](url) (rendered as their
  text). Anything else passes through as plain text.

.PARAMETER BodyPt
  Body font size in points. Lower this if the document spills past 2 pages.

.PARAMETER LeftAlign
  Use left-aligned body text instead of the default justified.

.EXAMPLE
  .\scripts\build-writeup-docx.ps1

.EXAMPLE
  .\scripts\build-writeup-docx.ps1 -BodyPt 10 -Open
#>
[CmdletBinding()]
param(
  [string]$InputPath,
  [string]$OutputPath,
  [double]$BodyPt = 10,
  [string]$Font = 'Times New Roman',
  [string]$Author,
  [string]$Subtitle,
  [switch]$LeftAlign,
  [switch]$Open
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $InputPath)  { $InputPath  = Join-Path $repoRoot 'WRITEUP.md' }
if (-not $OutputPath) { $OutputPath = Join-Path $repoRoot 'WRITEUP.docx' }
if (-not $Author) {
  try { $Author = (& git -C $repoRoot config user.name) } catch { $Author = '' }
  if (-not $Author) { $Author = $env:USERNAME }
}
if (-not (Test-Path $InputPath)) { throw "Input not found: $InputPath" }

# Word sizes are half-points; page geometry is twips (1 inch = 1440, 1 cm = 567).
$body     = [int][Math]::Round($BodyPt * 2)
$code     = $body - 2
$titleSz  = [int][Math]::Round($BodyPt * 2 * 1.7)
$h1Sz     = [int][Math]::Round($BodyPt * 2 * 1.22)
$subSz    = $body - 2
$margin   = 1134            # 2 cm — conventional for a formal A4 report
$pgW      = 11906           # A4
$pgH      = 16838
$jc       = if ($LeftAlign) { 'left' } else { 'both' }

function Esc([string]$s) {
  if ($null -eq $s) { return '' }
  $s = $s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
  return ($s -replace '"', '&quot;')
}

# Turns inline markdown into <w:r> runs. Bold is split first and code spans are
# resolved *within* each segment, so `code` nested inside **bold** keeps both
# rather than leaking its backticks as literal text.
# rPr child order is fixed by the OOXML schema (rStyle, rFonts, b, color, sz).
function New-Runs {
  param([string]$Text, [int]$Size, [switch]$BoldAll)

  $Text = [regex]::Replace($Text, '\[([^\]]+)\]\(([^)]+)\)', '$1')   # links -> label
  $xml = ''
  foreach ($seg in [regex]::Split($Text, '(\*\*.+?\*\*)')) {
    if ([string]::IsNullOrEmpty($seg)) { continue }
    $bold = [bool]$BoldAll
    $inner = $seg
    if ($seg -match '^\*\*(.+)\*\*$') { $bold = $true; $inner = $Matches[1] }

    foreach ($part in [regex]::Split($inner, '(`[^`]+`)')) {
      if ([string]::IsNullOrEmpty($part)) { continue }
      $isCode = $false
      $t = $part
      if ($part -match '^`(.+)`$') { $isCode = $true; $t = $Matches[1] }

      $rPr = ''
      if ($isCode) { $rPr += '<w:rStyle w:val="CodeChar"/>' }
      if ($bold)   { $rPr += '<w:b/>' }
      if (-not $isCode) { $rPr += '<w:sz w:val="' + $Size + '"/>' }
      $xml += '<w:r><w:rPr>' + $rPr + '</w:rPr><w:t xml:space="preserve">' + (Esc $t) + '</w:t></w:r>'
    }
  }
  return $xml
}

function New-Styled {
  param([string]$Text, [string]$Style, [int]$Size, [switch]$BoldAll)
  $pPr = '<w:pPr><w:pStyle w:val="' + $Style + '"/></w:pPr>'
  return '<w:p>' + $pPr + (New-Runs -Text $Text -Size $Size -BoldAll:$BoldAll) + '</w:p>'
}

function New-Body {
  param([string]$Text, [int]$Size)
  return '<w:p>' + (New-Runs -Text $Text -Size $Size) + '</w:p>'
}

# Real Word list bullets via numbering.xml, not a literal bullet character.
function New-Bullet {
  param([string]$Text, [int]$Size)
  $pPr = '<w:pPr><w:pStyle w:val="ListParagraph"/>' +
         '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
  return '<w:p>' + $pPr + (New-Runs -Text $Text -Size $Size) + '</w:p>'
}

function New-Table {
  param([string[][]]$Rows, [int]$Size)
  $xml = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
  foreach ($edge in 'top', 'left', 'bottom', 'right', 'insideH', 'insideV') {
    $xml += '<w:' + $edge + ' w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>'
  }
  $xml += '</w:tblBorders><w:tblCellMar>' +
          '<w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
          '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>' +
          '</w:tblCellMar></w:tblPr>'
  $first = $true
  foreach ($row in $Rows) {
    $xml += '<w:tr>'
    if ($first) { $xml += '<w:trPr><w:tblHeader/></w:trPr>' }
    foreach ($cell in $row) {
      $tcPr = '<w:tcPr>'
      if ($first) { $tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="EDEDED"/>' }
      $tcPr += '<w:vAlign w:val="center"/></w:tcPr>'
      # Table cells stay left-aligned even when the body is justified.
      $p = '<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>' +
           '<w:jc w:val="left"/></w:pPr>' +
           (New-Runs -Text $cell -Size $Size -BoldAll:$first) + '</w:p>'
      $xml += '<w:tc>' + $tcPr + $p + '</w:tc>'
    }
    $xml += '</w:tr>'
    $first = $false
  }
  return $xml + '</w:tbl><w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>'
}

# ---- parse the markdown -------------------------------------------------------
$lines = Get-Content -LiteralPath $InputPath -Encoding UTF8
$bodyXml = ''
$tableBuf = New-Object System.Collections.ArrayList
$stats = @{ title = 0; h1 = 0; para = 0; bullet = 0; table = 0 }

function Flush-Table {
  if ($tableBuf.Count -eq 0) { return }
  $rows = @()
  foreach ($r in $tableBuf) {
    if ($r -match '^\s*\|[\s:\-\|]+\|\s*$') { continue }   # |---|---| separator
    $cells = ($r.Trim() -replace '^\|', '' -replace '\|$', '') -split '\s*\|\s*'
    $rows += , ($cells | ForEach-Object { $_.Trim() })
  }
  if ($rows.Count -gt 0) {
    $script:bodyXml += New-Table -Rows $rows -Size $script:body
    $script:stats.table++
  }
  $tableBuf.Clear()
}

foreach ($raw in $lines) {
  $line = $raw.TrimEnd()

  if ($line -match '^\s*\|.*\|\s*$') { [void]$tableBuf.Add($line); continue }
  Flush-Table

  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line -match '^---+$') { continue }

  if ($line -match '^#\s+(.*)') {
    # '#' is the document title; a subtitle line follows it immediately.
    $bodyXml += New-Styled -Text $Matches[1] -Style 'Title' -Size $titleSz
    if (-not $Subtitle) { $Subtitle = "$Author  |  " + (Get-Date -Format 'd MMMM yyyy') }
    $bodyXml += New-Styled -Text $Subtitle -Style 'Subtitle' -Size $subSz
    $stats.title++
  }
  elseif ($line -match '^##\s+(.*)') {
    $bodyXml += New-Styled -Text $Matches[1] -Style 'Heading1' -Size $h1Sz
    $stats.h1++
  }
  elseif ($line -match '^\s*-\s+(.*)') {
    $bodyXml += New-Bullet -Text $Matches[1] -Size $body
    $stats.bullet++
  }
  else {
    $bodyXml += New-Body -Text $line -Size $body
    $stats.para++
  }
}
Flush-Table

# ---- OpenXML parts ------------------------------------------------------------
$W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
$R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
$decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

$sectPr = '<w:sectPr>' +
          '<w:footerReference w:type="default" r:id="rId3"/>' +
          '<w:pgSz w:w="' + $pgW + '" w:h="' + $pgH + '"/>' +
          '<w:pgMar w:top="' + $margin + '" w:right="' + $margin + '" w:bottom="' + $margin +
          '" w:left="' + $margin + '" w:header="567" w:footer="567" w:gutter="0"/>' +
          '</w:sectPr>'

$documentXml = $decl + '<w:document ' + $W + ' ' + $R + '><w:body>' + $bodyXml + $sectPr + '</w:body></w:document>'

$stylesXml = $decl + '<w:styles ' + $W + '>' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="' + $Font + '" w:hAnsi="' + $Font + '" w:cs="' + $Font + '"/>' +
    '<w:sz w:val="' + $body + '"/><w:szCs w:val="' + $body + '"/>' +
  '</w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr>' +
    '<w:spacing w:after="120" w:line="252" w:lineRule="auto"/><w:jc w:val="' + $jc + '"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>' +

  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +

  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="' + $titleSz + '"/></w:rPr></w:style>' +

  '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="40" w:after="240"/><w:jc w:val="center"/></w:pPr>' +
    '<w:rPr><w:i/><w:color w:val="595959"/><w:sz w:val="' + $subSz + '"/></w:rPr></w:style>' +

  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="A6A6A6"/></w:pBdr>' +
    '<w:spacing w:before="240" w:after="100"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="' + $h1Sz + '"/></w:rPr></w:style>' +

  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>' +
    '<w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="80"/><w:contextualSpacing/></w:pPr></w:style>' +

  '<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:qFormat/>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' +
    '<w:color w:val="A31515"/><w:sz w:val="' + $code + '"/></w:rPr></w:style>' +
  '</w:styles>'

# 0xF0B7 is the round bullet glyph in the Symbol font — what Word itself uses.
$numberingXml = $decl + '<w:numbering ' + $W + '>' +
  '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' +
  '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>' +
  '<w:lvlText w:val="&#xF0B7;"/><w:lvlJc w:val="left"/>' +
  '<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>' +
  '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>' +
  '</w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'

$footerXml = $decl + '<w:ftr ' + $W + ' ' + $R + '>' +
  '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
  '<w:r><w:rPr><w:sz w:val="' + $subSz + '"/><w:color w:val="595959"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:rPr><w:sz w:val="' + $subSz + '"/><w:color w:val="595959"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:rPr><w:sz w:val="' + $subSz + '"/><w:color w:val="595959"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:rPr><w:sz w:val="' + $subSz + '"/><w:color w:val="595959"/></w:rPr><w:t>1</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="' + $subSz + '"/><w:color w:val="595959"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>' +
  '</w:p></w:ftr>'

$docRels = $decl + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
  '</Relationships>'

$contentTypes = $decl + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '</Types>'

$rels = $decl + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '</Relationships>'

$title = (Get-Content -LiteralPath $InputPath -TotalCount 1) -replace '^#\s*', ''
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$coreXml = $decl +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  '<dc:title>' + (Esc $title) + '</dc:title>' +
  '<dc:creator>' + (Esc $Author) + '</dc:creator>' +
  '<cp:lastModifiedBy>' + (Esc $Author) + '</cp:lastModifiedBy>' +
  '<dcterms:created xsi:type="dcterms:W3CDTF">' + $now + '</dcterms:created>' +
  '<dcterms:modified xsi:type="dcterms:W3CDTF">' + $now + '</dcterms:modified>' +
  '</cp:coreProperties>'

# Fail loudly on malformed XML rather than shipping a .docx Word refuses to open.
$parts = @(
  @{ n = '[Content_Types].xml';      c = $contentTypes },   # must be first per OPC
  @{ n = '_rels/.rels';              c = $rels },
  @{ n = 'docProps/core.xml';        c = $coreXml },
  @{ n = 'word/_rels/document.xml.rels'; c = $docRels },
  @{ n = 'word/document.xml';        c = $documentXml },
  @{ n = 'word/styles.xml';          c = $stylesXml },
  @{ n = 'word/numbering.xml';       c = $numberingXml },
  @{ n = 'word/footer1.xml';         c = $footerXml }
)
foreach ($p in $parts) {
  try { [xml]$p.c | Out-Null } catch { throw "Generated XML is not well-formed in $($p.n): $($_.Exception.Message)" }
}

# A .docx open in Word/WPS or previewed in Explorer holds a lock; say so plainly
# rather than surfacing a raw IOException.
if (Test-Path $OutputPath) {
  try { Remove-Item $OutputPath -Force -ErrorAction Stop }
  catch {
    throw ("Cannot overwrite $OutputPath - it is open in another program " +
           "(Word/WPS, or the Explorer preview pane). Close it and re-run.")
  }
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$zip = [System.IO.Compression.ZipFile]::Open($OutputPath, 'Create')
try {
  foreach ($p in $parts) {
    $entry = $zip.CreateEntry($p.n, [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    $bytes = $utf8.GetBytes($p.c)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
  }
}
finally { $zip.Dispose() }

# ---- report -------------------------------------------------------------------
# Rough page estimate from font metrics. An estimate only — the renderer decides.
$textWidthPt  = ($pgW - 2 * $margin) / 20
$textHeightPt = ($pgH - 2 * $margin) / 20
$charsPerLine = [Math]::Floor($textWidthPt / (0.44 * $BodyPt))
$linesPerPage = [Math]::Floor($textHeightPt / ($BodyPt * 1.2 * 1.05))
$chars = ((Get-Content -LiteralPath $InputPath -Raw) -replace '[#*`|\-]', '').Length
$pages = [Math]::Round((($chars / $charsPerLine) + 30) / $linesPerPage, 2)

$words = (Get-Content -LiteralPath $InputPath | Measure-Object -Word).Words
$kb = [Math]::Round((Get-Item $OutputPath).Length / 1KB, 1)
Write-Output ""
Write-Output "  Wrote $OutputPath ($kb KB)"
Write-Output "  Source   : $InputPath - $words words"
Write-Output "  Rendered : $($stats.title) title, $($stats.h1) headings, $($stats.para) paragraphs, $($stats.bullet) bullets, $($stats.table) table(s)"
Write-Output "  Format   : $Font ${BodyPt}pt / A4 / 2cm margins / $(if($LeftAlign){'left-aligned'}else{'justified'}) / page numbers"
Write-Output "  Styles   : Title, Subtitle, Heading 1, List Paragraph, Code Char"
Write-Output "  Estimate : ~$pages pages  (estimate only - open it and confirm)"
Write-Output ""
if ($pages -gt 2.0) { Write-Output "  Over 2 pages - try: -BodyPt 10" ; Write-Output "" }

if ($Open) { Start-Process $OutputPath }
