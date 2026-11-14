# Static controlled fixture; never applied. Other unrelated checks may still fail.
resource "aws_s3_bucket" "fixture" {
  bucket = "synthetic-wetscan-fixture"
}
resource "aws_s3_bucket_public_access_block" "fixture" {
  bucket                  = aws_s3_bucket.fixture.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
