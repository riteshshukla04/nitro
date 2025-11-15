echo "🔥 Buidling Rust Module"

cd ..
cd rust
pwd
rm -rf Cargo.lock
rm -rf target
rm -rf ios
rm -rf include
cp Cargo.toml.android Cargo.toml
~/.cargo/bin/cargo ndk -t armeabi-v7a -t arm64-v8a -t x86_64 -t x86  build --release
cd ..
cd android